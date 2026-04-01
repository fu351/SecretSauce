/**
 * POST /api/receipt/process
 *
 * Accepts structured receipt data from the OCR parser and persists it to Supabase:
 *   1. Resolves each item against product_mappings (by raw name + store brand).
 *   2. Items with a resolved standardized_ingredient_id are added to pantry_items directly.
 *   3. Unknown items get a new product_mappings row + ingredient_match_queue entry so the
 *      background ingredient-worker can resolve them asynchronously.
 *
 * Body (JSON):
 * {
 *   parsedReceipt: {
 *     store: string            // e.g. "Walmart"
 *     date: string | null      // "YYYY-MM-DD"
 *     items: Array<{ name: string; quantity: number; price: number }>
 *     subtotal?: number | null
 *     total?: number | null
 *   }
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   pantryAdded: number        // rows inserted into pantry_items
 *   queued: number             // new items sent to ingredient_match_queue
 *   skipped: number            // items skipped (no name, or already in pantry)
 *   items: Array<{
 *     name: string
 *     status: "added" | "queued" | "skipped"
 *     standardized_ingredient_id?: string
 *     pantry_item_id?: string
 *     mapping_id?: string
 *   }>
 *   error?: string
 * }
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { productMappingsDB } from "@/lib/database/product-mappings-db"
import type { Database } from "@/lib/database/supabase"

export const runtime = "nodejs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoreBrandEnum = Database["public"]["Enums"]["grocery_store"]

interface ReceiptItem {
  name: string
  quantity: number
  price: number
}

interface ParsedReceipt {
  store: string
  date?: string | null
  items: ReceiptItem[]
  subtotal?: number | null
  total?: number | null
}

interface ProcessedItem {
  name: string
  status: "added" | "queued" | "skipped"
  standardized_ingredient_id?: string
  pantry_item_id?: string
  mapping_id?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a store name string to a grocery_store enum value. Mirrors
 *  resolveStoreBrand() in product-mappings-db.ts but is inlined here so this
 *  route has no circular dependency on that module's private internals. */
function resolveStoreBrand(store: string): StoreBrandEnum | null {
  const n = store.toLowerCase().replace(/\s+/g, "").replace(/'/g, "").trim()
  const ENUM_SET = new Set<StoreBrandEnum>([
    "aldi", "kroger", "safeway", "meijer", "target",
    "traderjoes", "99ranch", "walmart", "andronicos", "wholefoods",
  ])
  if (ENUM_SET.has(n as StoreBrandEnum)) return n as StoreBrandEnum
  if (n.includes("target"))                        return "target"
  if (n.includes("kroger") || n.includes("foodsco")) return "kroger"
  if (n.includes("meijer"))                        return "meijer"
  if (n.includes("99") || n.includes("ranch"))     return "99ranch"
  if (n.includes("walmart"))                       return "walmart"
  if (n.includes("trader"))                        return "traderjoes"
  if (n.includes("aldi"))                          return "aldi"
  if (n.includes("andronico"))                     return "andronicos"
  if (n.includes("safeway"))                       return "safeway"
  if (n.includes("whole"))                         return "wholefoods"
  return null
}

/** Produce a deterministic slug used as external_product_id for receipt items
 *  that lack a real store product ID. */
function slugifyProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown"
}

/** Lightweight clean: lowercase + collapse whitespace. Used as cleaned_name
 *  for the ingredient_match_queue row. */
function cleanName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim()
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // --- Auth ---
  const authState = await auth()
  const clerkUserId = authState?.userId
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = profileIdFromClerkUserId(clerkUserId)

  // --- Parse body ---
  let parsedReceipt: ParsedReceipt
  try {
    const body = await request.json()
    parsedReceipt = body.parsedReceipt as ParsedReceipt
    if (!parsedReceipt || !Array.isArray(parsedReceipt.items)) {
      return NextResponse.json(
        { error: "parsedReceipt.items must be an array" },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const storeBrand = resolveStoreBrand(parsedReceipt.store ?? "")
  const receiptDate = parsedReceipt.date ?? null
  const serviceClient = createServiceSupabaseClient()

  const results: ProcessedItem[] = []
  let pantryAdded = 0
  let queued = 0
  let skipped = 0

  // --- Process each item ---
  for (const item of parsedReceipt.items) {
    const rawName = item.name?.trim()
    if (!rawName) {
      skipped++
      results.push({ name: "", status: "skipped" })
      continue
    }

    // 1. Check product_mappings for an already-resolved match (exact substring)
    const existingMappings = await productMappingsDB.lookupByRawName(rawName, storeBrand)

    // Pick the best match: highest confidence, is_ingredient = true, resolved
    let bestMatch = existingMappings.find(
      (m) =>
        m.standardized_ingredient_id &&
        m.is_ingredient !== false &&
        (m.ingredient_confidence ?? 0) >= 0.5
    )

    // 1b. Fuzzy fallback: if exact match failed, try similarity-based lookup
    if (!bestMatch) {
      const fuzzyMatches = await productMappingsDB.fuzzyLookupByName(rawName, storeBrand)
      bestMatch = fuzzyMatches.find(
        (m) =>
          m.standardized_ingredient_id &&
          m.is_ingredient !== false &&
          (m.ingredient_confidence ?? 0) >= 0.5 &&
          (m.similarity ?? 0) >= 0.4
      )
    }

    if (bestMatch) {
      // 2a. Known product → insert directly into pantry_items
      const { data: pantryRow, error: pantryErr } = await serviceClient
        .from("pantry_items")
        .insert({
          user_id: userId,
          name: rawName,
          quantity: item.quantity ?? 1,
          unit_price: item.price ?? null,
          standardized_ingredient_id: bestMatch.standardized_ingredient_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (pantryErr) {
        console.error("[receipt/process] pantry insert failed", pantryErr)
        skipped++
        results.push({ name: rawName, status: "skipped" })
        continue
      }

      pantryAdded++
      results.push({
        name: rawName,
        status: "added",
        standardized_ingredient_id: bestMatch.standardized_ingredient_id ?? undefined,
        pantry_item_id: pantryRow?.id,
        mapping_id: bestMatch.id,
      })
      continue
    }

    // 2b. Unknown product → create product_mappings row, queue for resolution,
    //     then add to pantry_items without a standardized_ingredient_id.
    const externalId = slugifyProductName(rawName)

    const mappingId = await productMappingsDB.insertMapping({
      external_product_id: externalId,
      store_brand: storeBrand ?? ("walmart" as StoreBrandEnum), // fallback; worker will update
      raw_product_name: rawName,
      last_seen_at: new Date().toISOString(),
    })

    if (mappingId) {
      // Queue for background ingredient-worker resolution
      const { error: queueErr } = await serviceClient
        .from("ingredient_match_queue")
        .insert({
          product_mapping_id: mappingId,
          raw_product_name: rawName,
          cleaned_name: cleanName(rawName),
          source: "scraper" as const,
          status: "pending" as const,
          needs_ingredient_review: true,
        })

      if (queueErr) {
        // unique_pending_mapping constraint → already queued; not a hard error
        if (queueErr.code !== "23505") {
          console.warn("[receipt/process] queue insert warning", queueErr.code, queueErr.message)
        }
      }
    }

    // Insert pantry_items without standardized_ingredient_id (will be backfilled by trigger
    // once ingredient_match_queue resolves the mapping).
    const { data: pantryRow, error: pantryErr } = await serviceClient
      .from("pantry_items")
      .insert({
        user_id: userId,
        name: rawName,
        quantity: item.quantity ?? 1,
        unit_price: item.price ?? null,
        standardized_ingredient_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (pantryErr) {
      console.error("[receipt/process] pantry insert (unresolved) failed", pantryErr)
      skipped++
      results.push({ name: rawName, status: "skipped" })
      continue
    }

    queued++
    results.push({
      name: rawName,
      status: "queued",
      pantry_item_id: pantryRow?.id,
      mapping_id: mappingId ?? undefined,
    })
  }

  return NextResponse.json({
    success: true,
    pantryAdded,
    queued,
    skipped,
    storeBrand,
    receiptDate,
    items: results,
  })
}
