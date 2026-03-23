#!/usr/bin/env tsx

import "dotenv/config"
import * as baseDbModule from "../lib/database/base-db"
import * as embeddingQueueDbModule from "../lib/database/embedding-queue-db"
import type { EmbeddingSourceType } from "../lib/database/embedding-queue-db"

const fromFn =
  (baseDbModule as { from?: unknown }).from ??
  (baseDbModule as { default?: { from?: unknown } }).default?.from

if (typeof fromFn !== "function") {
  throw new Error("Failed to load from() from base DB module")
}

const from = fromFn as any

const embeddingQueueDB =
  (embeddingQueueDbModule as { embeddingQueueDB?: unknown }).embeddingQueueDB ??
  (embeddingQueueDbModule as { default?: { embeddingQueueDB?: unknown } }).default?.embeddingQueueDB

if (!embeddingQueueDB || typeof embeddingQueueDB !== "object") {
  throw new Error("Failed to load embeddingQueueDB from embedding queue DB module")
}

const embeddingQueueDBClient = embeddingQueueDB as {
  enqueueSource: (params: {
    sourceType: EmbeddingSourceType
    sourceId: string
    inputText: string
    model: string
  }) => Promise<"inserted" | "updated" | "failed">
}

type BackfillSourceType = EmbeddingSourceType | "any"

interface BackfillSummary {
  sourceType: EmbeddingSourceType
  scanned: number
  inserted: number
  updated: number
  failed: number
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function resolveSourceType(value: string | undefined): BackfillSourceType {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "recipe" || normalized === "ingredient") return normalized
  return "any"
}

function resolveModel(value: string | undefined): string {
  const normalized = String(value ?? "").trim()
  return normalized || "text-embedding-3-small"
}

function buildRecipeEmbeddingInput(recipe: {
  title: string | null
  description: string | null
  instructions_list: string[] | null
}): string {
  const instructionPreview = Array.isArray(recipe.instructions_list)
    ? recipe.instructions_list.slice(0, 8).join(" ")
    : ""

  const parts = [recipe.title || "", recipe.description || "", instructionPreview]
  return parts
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function buildIngredientEmbeddingInput(ingredient: {
  canonical_name: string
  category: string | null
  is_food_item: boolean
}): string {
  const parts = [
    ingredient.canonical_name,
    ingredient.category ? `category: ${ingredient.category}` : "",
    ingredient.is_food_item ? "is_food_item: true" : "is_food_item: false",
  ]

  return parts.filter(Boolean).join("\n")
}

async function backfillRecipes(batchSize: number, model: string): Promise<BackfillSummary> {
  let offset = 0
  let scanned = 0
  let inserted = 0
  let updated = 0
  let failed = 0

  while (true) {
    const { data, error } = await from("recipes")
      .select("id,title,description,instructions_list")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      throw new Error(`Failed to fetch recipes for backfill: ${error.message}`)
    }

    const rows = data || []
    if (!rows.length) break

    for (const row of rows) {
      scanned += 1
      const inputText = buildRecipeEmbeddingInput(row)
      if (!inputText) continue

      const result = await embeddingQueueDBClient.enqueueSource({
        sourceType: "recipe",
        sourceId: row.id,
        inputText,
        model,
      })

      if (result === "inserted") inserted += 1
      else if (result === "updated") updated += 1
      else failed += 1
    }

    offset += rows.length
    if (rows.length < batchSize) break
  }

  return {
    sourceType: "recipe",
    scanned,
    inserted,
    updated,
    failed,
  }
}

async function backfillIngredients(batchSize: number, model: string): Promise<BackfillSummary> {
  let offset = 0
  let scanned = 0
  let inserted = 0
  let updated = 0
  let failed = 0

  while (true) {
    const { data, error } = await from("standardized_ingredients")
      .select("id,canonical_name,category,is_food_item")
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      throw new Error(`Failed to fetch standardized ingredients for backfill: ${error.message}`)
    }

    const rows = data || []
    if (!rows.length) break

    for (const row of rows) {
      scanned += 1
      const inputText = buildIngredientEmbeddingInput(row)
      if (!inputText) continue

      const result = await embeddingQueueDBClient.enqueueSource({
        sourceType: "ingredient",
        sourceId: row.id,
        inputText,
        model,
      })

      if (result === "inserted") inserted += 1
      else if (result === "updated") updated += 1
      else failed += 1
    }

    offset += rows.length
    if (rows.length < batchSize) break
  }

  return {
    sourceType: "ingredient",
    scanned,
    inserted,
    updated,
    failed,
  }
}

function requireSupabaseEnv(): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }
}

async function main(): Promise<void> {
  requireSupabaseEnv()
  const sourceType = resolveSourceType(process.env.EMBEDDING_BACKFILL_SOURCE_TYPE)
  const batchSize = readPositiveInt(process.env.EMBEDDING_BACKFILL_BATCH_SIZE, 500)
  const model = resolveModel(process.env.EMBEDDING_OPENAI_MODEL)

  console.log(
    `[EmbeddingBackfill] Starting backfill ` +
      `(source=${sourceType}, batchSize=${batchSize}, model=${model})`
  )

  const summaries: BackfillSummary[] = []
  if (sourceType === "any" || sourceType === "recipe") {
    summaries.push(await backfillRecipes(batchSize, model))
  }

  if (sourceType === "any" || sourceType === "ingredient") {
    summaries.push(await backfillIngredients(batchSize, model))
  }

  let totalScanned = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalFailed = 0

  for (const summary of summaries) {
    totalScanned += summary.scanned
    totalInserted += summary.inserted
    totalUpdated += summary.updated
    totalFailed += summary.failed

    console.log(
      `[EmbeddingBackfill] ${summary.sourceType}: ` +
        `scanned=${summary.scanned}, inserted=${summary.inserted}, ` +
        `updated=${summary.updated}, failed=${summary.failed}`
    )
  }

  console.log(
    `[EmbeddingBackfill] Complete: scanned=${totalScanned}, inserted=${totalInserted}, ` +
      `updated=${totalUpdated}, failed=${totalFailed}`
  )

  if (totalFailed > 0) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error("[EmbeddingBackfill] Unhandled error:", error)
  process.exit(1)
})
