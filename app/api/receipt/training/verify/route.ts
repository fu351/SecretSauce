/**
 * POST /api/receipt/training/verify
 *
 * Records a verification decision on a receipt_training_examples row.
 *
 * Two paths:
 *   - "confirm": the user (or admin) says the candidate parse is correct.
 *     The candidate becomes the verified parse with no edits.
 *   - "edit":    the user supplied a corrected parse JSON. We store the
 *     user's edits as the verified parse so the export script picks the
 *     edited version, not the candidate.
 *
 * GET /api/receipt/training/verify?id=<uuid>
 *
 * Returns the row + a short-lived signed URL for the receipt image so the
 * verification UI can render it.
 *
 * Auth: Clerk. Same trust boundary as the rest of the receipt routes.
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

const TRAINING_BUCKET = "receipt-training-images"
const SIGNED_URL_TTL_SECONDS = 60 * 10 // 10 min — enough for one verification session

interface VerifyBody {
  id: string
  action: "confirm" | "edit" | "reject"
  // Required when action === "edit". Schema mirrors ReceiptParseResult.
  edited_parse?: {
    store: string
    date: string | null
    items: Array<{ name: string; quantity: number; price: number }>
    subtotal?: number | null
    taxes?: Array<{ rate: number; amount: number }>
    total?: number | null
  }
  notes?: string
}

export async function POST(request: NextRequest) {
  const authState = await auth()
  const clerkUserId = authState?.userId
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: VerifyBody
  try {
    body = (await request.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body?.id || !body?.action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 })
  }
  if (!["confirm", "edit", "reject"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }
  if (body.action === "edit" && !body.edited_parse) {
    return NextResponse.json({ error: "edit action requires edited_parse" }, { status: 400 })
  }

  const userId = profileIdFromClerkUserId(clerkUserId)
  const sb = createServiceSupabaseClient()

  // Load the row first so we can:
  //  1. Check the user has standing (own row OR admin) — we don't have admin
  //     roles in the schema yet, so this is owner-only for now. When roles
  //     ship, replace with `userId === row.user_id || isAdmin(userId)`.
  //  2. Compute the verified_by tag with proper attribution.
  const { data: row, error: loadErr } = await sb
    .from("receipt_training_examples")
    .select("id, user_id, candidate_parse, disposition, deleted_at")
    .eq("id", body.id)
    .maybeSingle()
  if (loadErr) {
    return NextResponse.json({ error: `Lookup failed: ${loadErr.message}` }, { status: 500 })
  }
  if (!row || row.deleted_at) {
    return NextResponse.json({ error: "Training example not found" }, { status: 404 })
  }
  if (row.user_id && row.user_id !== userId) {
    // Tighten this to admin-allowed once role plumbing exists.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Build the update payload.
  const now = new Date().toISOString()
  const verifiedBy = `user:${userId}`
  let update: Record<string, any>

  if (body.action === "reject") {
    // Soft-delete via disposition flip. We keep the row + image so a future
    // admin pass can audit; we just stop offering it for export.
    update = {
      disposition: "rejected",
      verified_by: verifiedBy,
      verified_at: now,
      verifier_notes: body.notes ?? null,
    }
  } else if (body.action === "confirm") {
    // No edits — the candidate parse becomes the verified parse.
    update = {
      verified_by: verifiedBy,
      verified_at: now,
      verified_parse: row.candidate_parse,
      verifier_notes: body.notes ?? null,
      // If it was needs_review and we confirmed it without edits, it now
      // qualifies as accepted (just with a human attestation).
      disposition: row.disposition === "rejected" ? "rejected" : "auto_accepted",
    }
  } else {
    update = {
      verified_by: verifiedBy,
      verified_at: now,
      verified_parse: body.edited_parse,
      verifier_notes: body.notes ?? null,
      disposition: "auto_accepted",
    }
  }

  const { error: updateErr } = await sb
    .from("receipt_training_examples")
    .update(update)
    .eq("id", body.id)
  if (updateErr) {
    return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: body.id, action: body.action })
}

export async function GET(request: NextRequest) {
  const authState = await auth()
  const clerkUserId = authState?.userId
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const id = request.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const userId = profileIdFromClerkUserId(clerkUserId)
  const sb = createServiceSupabaseClient()

  const { data: row, error } = await sb
    .from("receipt_training_examples")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (row.user_id && row.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Mint a short-lived signed URL for the image.
  let signedImageUrl: string | null = null
  if (row.image_storage_path) {
    const { data: signed } = await sb.storage
      .from(TRAINING_BUCKET)
      .createSignedUrl(row.image_storage_path, SIGNED_URL_TTL_SECONDS)
    signedImageUrl = signed?.signedUrl ?? null
  }

  return NextResponse.json({ success: true, row, signedImageUrl })
}
