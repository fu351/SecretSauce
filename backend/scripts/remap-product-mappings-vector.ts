#!/usr/bin/env tsx
/**
 * remap-product-mappings-vector.ts
 *
 * Uses Ollama vector embeddings to find better ingredient matches for all
 * non-manual product_mappings rows, updating standardized_ingredient_id when
 * a higher-confidence match is found.
 *
 * For rows that already have a mapping: only updates when the new match is a
 * different canonical AND scores >= MIN_CONFIDENCE (default 0.93).
 * For rows with no mapping: updates when score >= MIN_NULL_CONFIDENCE (default 0.80).
 *
 * Embeddings are cached in product_embeddings so re-runs skip Ollama for rows
 * already embedded. Each page embeds all uncached names in a single Ollama
 * batch call, then fans out vector matching and DB updates concurrently.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   OLLAMA_BASE_URL         (default: http://localhost:11434)
 *   EMBEDDING_MODEL         (default: nomic-embed-text)
 *   BATCH_SIZE              rows per page (default: 100)
 *   CHUNK_CONCURRENCY       parallel vector+update ops per page (default: 10)
 *   MIN_CONFIDENCE          threshold for updating existing mappings (default: 0.93)
 *   MIN_NULL_CONFIDENCE     threshold for filling null mappings (default: 0.80)
 *   DRY_RUN                 set to "true" to skip writes (default: false)
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchEmbeddingsFromOllama } from "../../lib/ollama/embeddings"
import { hasNonFoodTitleSignals } from "../workers/shared/non-food-signals"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434"
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim() || "nomic-embed-text"
const BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE || "100", 10))
const CHUNK_CONCURRENCY = Math.max(1, parseInt(process.env.CHUNK_CONCURRENCY || "10", 10))
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || "0.52")
const MIN_NULL_CONFIDENCE = parseFloat(process.env.MIN_NULL_CONFIDENCE || "0.47")
const DRY_RUN = (process.env.DRY_RUN ?? "").trim().toLowerCase() === "true"

type SupabaseClient = ReturnType<typeof createClient<any>>

// ---------------------------------------------------------------------------
// Product name normalization
//
// Strips retail noise (weights, sizes, brands, counts) before embedding so
// "Spice World Premium Minced Squeeze Garlic - 9.5oz" embeds closer to
// "garlic" than to arbitrary noise tokens.
// ---------------------------------------------------------------------------

function normalizeProductName(raw: string): string {
  return raw
    // Remove weight/size with separator:  "- 9.5oz", "– 750ml Bottle"
    .replace(/\s*[-–]\s*[\d][\d.\s]*(oz|lb|lbs|g|kg|ml|l|fl\s*oz|count|ct|pk|pack|each|piece|pieces|unit|units)\b.*/gi, "")
    // Remove inline weight/size:  "5 Oz", "99.0000 g/each", "1-Pack"
    .replace(/\b[\d][\d.]*\s*(oz|lb|lbs|g\/each|g|kg|ml|l|fl\s*oz|count|ct|pk|pack|each|piece|pieces)\b.*/gi, "")
    // Remove trailing retail container words
    .replace(/\s+(bottle|bag|box|can|jar|pack|pouch|container|carton|tube)\s*$/gi, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Rerank helpers (mirrors backend/workers/ingredient-worker/scoring/vector-match.ts)
// ---------------------------------------------------------------------------

const HEAD_BONUS = 0.03
const LEXICAL_BONUS = 0.02
const FORM_PENALTY = -0.04
const VECTOR_MATCH_K = 25
// nomic-embed-text produces cosine similarities in the ~0.40–0.60 range for
// food/ingredient text — much lower than text-embedding-3-small's 0.85–0.99.
// Floor and thresholds are calibrated accordingly.
const VECTOR_MIN_COSINE_FLOOR = 0.40

const PROTECTED_FORM_TOKENS = new Set([
  "paste", "powder", "sauce", "broth", "stock", "puree",
  "extract", "juice", "syrup", "flakes", "seasoning", "mix",
])

function tokenize(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
}

function headNoun(tokens: string[]): string {
  return tokens.find((t) => t.length > 1) ?? tokens[0] ?? ""
}

function bigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(a)
  const bb = bigrams(b)
  let intersection = 0
  for (const bg of ba) if (bb.has(bg)) intersection++
  const union = ba.size + bb.size - intersection
  return union === 0 ? 0 : intersection / union
}

interface RankedCandidate {
  matchedId: string
  matchedName: string
  cosine: number
  finalScore: number
}

interface RawCandidate {
  matched_id: string
  matched_name: string
  confidence: number
}

function rerank(query: string, rows: RawCandidate[]): RankedCandidate[] {
  const qt = tokenize(query)

  return rows
    .map((row) => {
      const ct = tokenize(row.matched_name)
      const headBonus = headNoun(qt) === headNoun(ct) ? HEAD_BONUS : 0
      const lexicalBonus = bigramSimilarity(query, row.matched_name) >= 0.6 ? LEXICAL_BONUS : 0
      const queryForms = qt.filter((t) => PROTECTED_FORM_TOKENS.has(t))
      const candidateForms = ct.filter((t) => PROTECTED_FORM_TOKENS.has(t))
      const formConflict =
        (queryForms.length > 0 || candidateForms.length > 0) &&
        (queryForms.some((f) => !candidateForms.includes(f)) ||
          candidateForms.some((f) => !queryForms.includes(f)))
      return {
        matchedId: row.matched_id,
        matchedName: row.matched_name,
        cosine: row.confidence,
        finalScore: row.confidence + headBonus + lexicalBonus + (formConflict ? FORM_PENALTY : 0),
      }
    })
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
      if (b.cosine !== a.cosine) return b.cosine - a.cosine
      return a.matchedName.localeCompare(b.matchedName)
    })
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

interface ProductMappingRow {
  id: string
  raw_product_name: string | null
  standardized_ingredient_id: string | null
  ingredient_confidence: number | null
}

async function fetchTotalCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await (supabase as any)
    .from("product_mappings")
    .select("*", { count: "exact", head: true })
    .not("manual_override", "is", true)
  if (error) throw new Error(`Count query failed: ${error.message}`)
  return count ?? 0
}

async function fetchBatch(supabase: SupabaseClient, offset: number): Promise<ProductMappingRow[]> {
  const { data, error } = await (supabase as any)
    .from("product_mappings")
    .select("id, raw_product_name, standardized_ingredient_id, ingredient_confidence")
    .not("manual_override", "is", true)
    .range(offset, offset + BATCH_SIZE - 1)
    .order("id")
  if (error) throw new Error(`Fetch batch failed: ${error.message}`)
  return (data as ProductMappingRow[]) || []
}

/** Returns a map of product_mapping_id → cached embedding for the given model. */
async function fetchCachedEmbeddings(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, number[]>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await (supabase as any)
    .from("product_embeddings")
    .select("product_mapping_id, embedding")
    .in("product_mapping_id", ids)
    .eq("model", EMBEDDING_MODEL)
  if (error) {
    console.warn("[Cache] Failed to fetch cached embeddings:", error.message)
    return new Map()
  }
  const map = new Map<string, number[]>()
  for (const row of (data as any[]) || []) {
    map.set(row.product_mapping_id, row.embedding)
  }
  return map
}

async function upsertEmbeddings(
  supabase: SupabaseClient,
  rows: Array<{ id: string; inputText: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return
  const payload = rows.map((r) => ({
    product_mapping_id: r.id,
    input_text: r.inputText,
    embedding: r.embedding,
    model: EMBEDDING_MODEL,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await (supabase as any)
    .from("product_embeddings")
    .upsert(payload, { onConflict: "product_mapping_id,model" })
  if (error) console.warn("[Cache] Embedding upsert failed:", error.message)
}

async function matchVector(supabase: SupabaseClient, embedding: number[]): Promise<RawCandidate[]> {
  const { data, error } = await (supabase.rpc as any)("fn_match_ingredient_vector", {
    p_embedding: embedding,
    p_limit: VECTOR_MATCH_K,
    p_model: EMBEDDING_MODEL,
    p_high_confidence_threshold: 0.93,
    p_mid_confidence_threshold: 0.80,
  })
  if (error) {
    console.warn("[VectorMatch] RPC error:", error.message)
    return []
  }
  return ((data as any[]) || [])
    .filter((r) => (r.confidence ?? 0) >= VECTOR_MIN_COSINE_FLOOR)
    .map((r) => ({
      matched_id: String(r.matched_id ?? ""),
      matched_name: String(r.matched_name ?? ""),
      confidence: Number(r.confidence ?? 0),
    }))
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function renderProgress(processed: number, total: number, updated: number): void {
  const pct = total > 0 ? processed / total : 0
  const barWidth = 24
  const filled = Math.round(pct * barWidth)
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled)
  const pctStr = (pct * 100).toFixed(1).padStart(5)
  process.stdout.write(`\r  [${bar}] ${processed}/${total} (${pctStr}%) | updated: ${updated}  `)
}

function clearProgress(): void {
  process.stdout.write("\r\x1b[2K")
}

// ---------------------------------------------------------------------------
// Row processing
// ---------------------------------------------------------------------------

type RowOutcome = "updated" | "already_correct" | "below_threshold" | "no_match"

interface RowResult {
  outcome: RowOutcome
  logLine?: string
}

async function processRow(
  supabase: SupabaseClient,
  row: ProductMappingRow,
  embedding: number[],
): Promise<RowResult> {
  const productName = normalizeProductName(row.raw_product_name!)
  if (hasNonFoodTitleSignals(productName)) {
    return { outcome: "no_match" }
  }

  const rawCandidates = await matchVector(supabase, embedding)
  if (!rawCandidates.length) return { outcome: "no_match" }

  const ranked = rerank(productName, rawCandidates)
  const best = ranked[0]
  if (!best) return { outcome: "no_match" }

  if (best.matchedId === row.standardized_ingredient_id) {
    return { outcome: "already_correct" }
  }

  const threshold = row.standardized_ingredient_id === null ? MIN_NULL_CONFIDENCE : MIN_CONFIDENCE
  if (best.finalScore < threshold) return { outcome: "below_threshold" }

  const prevId = row.standardized_ingredient_id ?? "null"
  const logLine = DRY_RUN
    ? `[dry-run] ${row.id}: "${productName}" → "${best.matchedName}" (score=${best.finalScore.toFixed(3)}, prev=${prevId})`
    : `Updated ${row.id}: "${productName}" → "${best.matchedName}" (score=${best.finalScore.toFixed(3)}, prev=${prevId})`

  if (!DRY_RUN) {
    const { error: updateErr } = await (supabase as any)
      .from("product_mappings")
      .update({
        standardized_ingredient_id: best.matchedId,
        ingredient_confidence: best.finalScore,
      })
      .eq("id", row.id)

    if (updateErr) {
      return { outcome: "below_threshold", logLine: `[warn] ${row.id}: update failed — ${updateErr.message}` }
    }
  }

  return { outcome: "updated", logLine }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing required env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  const total = await fetchTotalCount(supabase)

  console.log("=== remap-product-mappings-vector ===")
  console.log(`  model          : ${EMBEDDING_MODEL}`)
  console.log(`  ollama_url     : ${OLLAMA_BASE_URL}`)
  console.log(`  batch_size     : ${BATCH_SIZE}`)
  console.log(`  concurrency    : ${CHUNK_CONCURRENCY}`)
  console.log(`  min_confidence : ${MIN_CONFIDENCE} (existing mapping)`)
  console.log(`  min_null_conf  : ${MIN_NULL_CONFIDENCE} (null mapping)`)
  console.log(`  dry_run        : ${DRY_RUN}`)
  console.log(`  total rows     : ${total}`)
  console.log()

  let offset = 0
  let totalProcessed = 0
  let totalUpdated = 0
  let totalAlreadyCorrect = 0
  let totalBelowThreshold = 0
  let totalNoMatch = 0
  let totalSkippedNoName = 0

  while (true) {
    const rows = await fetchBatch(supabase, offset)
    if (rows.length === 0) break

    // Separate rows with/without a product name
    const workable = rows.filter((r) => r.raw_product_name?.trim())
    totalSkippedNoName += rows.length - workable.length
    totalProcessed += rows.length - workable.length

    if (workable.length === 0) {
      offset += BATCH_SIZE
      if (rows.length < BATCH_SIZE) break
      continue
    }

    // 1. Fetch cached embeddings for this page in bulk
    const cached = await fetchCachedEmbeddings(supabase, workable.map((r) => r.id))

    // 2. Embed all uncached names in a single Ollama call
    const uncached = workable.filter((r) => !cached.has(r.id))
    if (uncached.length > 0) {
      try {
        const normalizedTexts = uncached.map((r) => normalizeProductName(r.raw_product_name!))
        const vectors = await fetchEmbeddingsFromOllama({
          model: EMBEDDING_MODEL,
          inputTexts: normalizedTexts,
          timeoutMs: 60_000,
          baseUrl: OLLAMA_BASE_URL,
        })
        // Store in cache map and upsert to DB
        const toUpsert: Array<{ id: string; inputText: string; embedding: number[] }> = []
        for (let i = 0; i < uncached.length; i++) {
          const vec = vectors[i]
          if (vec) {
            cached.set(uncached[i].id, vec)
            toUpsert.push({ id: uncached[i].id, inputText: normalizedTexts[i], embedding: vec })
          }
        }
        await upsertEmbeddings(supabase, toUpsert)
      } catch (err) {
        clearProgress()
        console.warn(`[Embed] Batch embedding failed: ${(err as Error).message}`)
        // Skip the whole page rather than partial processing
        totalBelowThreshold += uncached.length
        totalProcessed += workable.length
        renderProgress(totalProcessed, total, totalUpdated)
        offset += BATCH_SIZE
        if (rows.length < BATCH_SIZE) break
        continue
      }
    }

    // 3. Fan out vector matching + updates across CHUNK_CONCURRENCY workers
    for (let i = 0; i < workable.length; i += CHUNK_CONCURRENCY) {
      const chunk = workable.slice(i, i + CHUNK_CONCURRENCY)

      const settled = await Promise.allSettled(
        chunk.map((row) => {
          const embedding = cached.get(row.id)
          if (!embedding) return Promise.resolve<RowResult>({ outcome: "no_match" })
          return processRow(supabase, row, embedding)
        }),
      )

      // Collect and print results, then update progress
      const pendingLogs: string[] = []
      for (const result of settled) {
        const value: RowResult = result.status === "fulfilled"
          ? result.value
          : { outcome: "below_threshold", logLine: `[warn] Unexpected error: ${(result as any).reason}` }

        if (value.logLine) pendingLogs.push(value.logLine)

        switch (value.outcome) {
          case "updated":          totalUpdated++;       break
          case "already_correct":  totalAlreadyCorrect++; break
          case "below_threshold":  totalBelowThreshold++; break
          case "no_match":         totalNoMatch++;       break
        }
        totalProcessed++
      }

      if (pendingLogs.length > 0) {
        clearProgress()
        for (const line of pendingLogs) console.log(line)
      }
      renderProgress(totalProcessed, total, totalUpdated)
    }

    offset += BATCH_SIZE
    if (rows.length < BATCH_SIZE) break
  }

  clearProgress()
  console.log()
  console.log("=== Summary ===")
  console.log(`  Processed       : ${totalProcessed}`)
  console.log(`  Updated         : ${totalUpdated}`)
  console.log(`  Already correct : ${totalAlreadyCorrect}`)
  console.log(`  Below threshold : ${totalBelowThreshold}`)
  console.log(`  No vector match : ${totalNoMatch}`)
  console.log(`  No product name : ${totalSkippedNoName}`)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
