/**
 * Vector-based ingredient matching.
 *
 * Implements the rerank policy documented in docs/queue-and-standardization.md:
 *   final_score = cosine + head_bonus + lexical_bonus + category_penalty + form_penalty
 *
 * Used in three places in processor.ts:
 *   3a — Fast-path skip before LLM:   resolveVectorFastPath()
 *   3c — Semantic dedup after LLM:    vectorMatchCanonical()
 *
 * Embeddings are cached per worker process (module-level Map) so repeated
 * occurrences of the same product name within a run do not cause extra API
 * calls. The cache is bounded to EMBEDDING_CACHE_MAX_SIZE entries and evicts
 * the oldest entry when full.
 */

import { ingredientEmbeddingsDB, type VectorMatchRow } from "../../../../lib/database/ingredient-embeddings-db"
import { fetchEmbeddings } from "../../../../lib/openai/embeddings"

// ---------------------------------------------------------------------------
// Constants (documented in docs/queue-and-standardization.md)
// ---------------------------------------------------------------------------

export const VECTOR_MATCH_HIGH_CONFIDENCE = 0.93
export const VECTOR_MATCH_MID_CONFIDENCE = 0.80
export const SEMANTIC_DEDUP_THRESHOLD = 0.92

const VECTOR_MATCH_K = 25
const VECTOR_MIN_COSINE_FLOOR = 0.75

const HEAD_BONUS = 0.03
const LEXICAL_BONUS = 0.02
const CATEGORY_PENALTY = -0.05
const FORM_PENALTY = -0.04

const EMBEDDING_CACHE_MAX_SIZE = 2000

export const PROTECTED_FORM_TOKENS = new Set([
  "paste",
  "powder",
  "sauce",
  "broth",
  "stock",
  "puree",
  "extract",
  "juice",
  "syrup",
  "flakes",
  "seasoning",
  "mix",
])

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface VectorMatchCandidate {
  matchedId: string
  matchedName: string
  cosine: number
  matchedCategory: string | null
  embeddingModel: string
  headBonus: number
  lexicalBonus: number
  categoryPenalty: number
  formPenalty: number
  finalScore: number
}

// ---------------------------------------------------------------------------
// Embedding cache
// ---------------------------------------------------------------------------

const embeddingCache = new Map<string, number[]>()
const embeddingCacheOrder: string[] = []

function cacheGetEmbedding(key: string): number[] | undefined {
  return embeddingCache.get(key)
}

function cacheSetEmbedding(key: string, embedding: number[]): void {
  if (embeddingCache.has(key)) return
  if (embeddingCacheOrder.length >= EMBEDDING_CACHE_MAX_SIZE) {
    const oldest = embeddingCacheOrder.shift()
    if (oldest) embeddingCache.delete(oldest)
  }
  embeddingCache.set(key, embedding)
  embeddingCacheOrder.push(key)
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear()
  embeddingCacheOrder.length = 0
}

export function getEmbeddingModel(): string {
  return process.env.EMBEDDING_OPENAI_MODEL?.trim() || "text-embedding-3-small"
}

// ---------------------------------------------------------------------------
// OpenAI embedding call
// ---------------------------------------------------------------------------

export async function embedText(text: string, model: string): Promise<number[] | null> {
  const cacheKey = `${model}:${text}`
  const cached = cacheGetEmbedding(cacheKey)
  if (cached) return cached

  if (!process.env.OPENAI_API_KEY?.trim()) return null

  const vectors = await fetchEmbeddings({ model, inputTexts: [text], timeoutMs: 30000 })
  const embedding = vectors[0] ?? null
  if (embedding) cacheSetEmbedding(cacheKey, embedding)
  return embedding
}

// ---------------------------------------------------------------------------
// Rerank helpers
// ---------------------------------------------------------------------------

/** Tokenise a canonical name to a lowercase word array. */
function tokenize(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
}

/**
 * Head noun: the first meaningful token (skip single-letter tokens).
 * "chickpea flour" → "chickpea"; "flour" → "flour"; "a sauce" → "sauce".
 */
function headNoun(tokens: string[]): string {
  return tokens.find((t) => t.length > 1) ?? tokens[0] ?? ""
}

/** Simple character bigram overlap (Jaccard) as a proxy for trigram similarity. */
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

function computeHeadBonus(queryTokens: string[], candidateTokens: string[]): number {
  return headNoun(queryTokens) === headNoun(candidateTokens) ? HEAD_BONUS : 0
}

function computeLexicalBonus(query: string, candidate: string): number {
  return bigramSimilarity(query, candidate) >= 0.6 ? LEXICAL_BONUS : 0
}

function computeCategoryPenalty(
  queryCategory: string | null | undefined,
  candidateCategory: string | null,
): number {
  if (!queryCategory || !candidateCategory) return 0
  return queryCategory !== candidateCategory ? CATEGORY_PENALTY : 0
}

function computeFormPenalty(queryTokens: string[], candidateTokens: string[]): number {
  const queryForms = queryTokens.filter((t) => PROTECTED_FORM_TOKENS.has(t))
  const candidateForms = candidateTokens.filter((t) => PROTECTED_FORM_TOKENS.has(t))
  // Penalty when the query has a form token the candidate lacks, or vice versa.
  if (queryForms.length === 0 && candidateForms.length === 0) return 0
  const conflict = queryForms.some((f) => !candidateForms.includes(f)) ||
    candidateForms.some((f) => !queryForms.includes(f))
  return conflict ? FORM_PENALTY : 0
}

/** Apply the deterministic rerank formula and sort: final_score DESC, cosine DESC, name ASC. */
function rerankCandidates(
  query: string,
  rawRows: VectorMatchRow[],
  queryCategory?: string | null,
): VectorMatchCandidate[] {
  const queryTokens = tokenize(query)

  const candidates: VectorMatchCandidate[] = rawRows.map((row) => {
    const candidateTokens = tokenize(row.matched_name)
    const headBonus = computeHeadBonus(queryTokens, candidateTokens)
    const lexicalBonus = computeLexicalBonus(query, row.matched_name)
    const categoryPenalty = computeCategoryPenalty(queryCategory, row.matched_category)
    const formPenalty = computeFormPenalty(queryTokens, candidateTokens)
    const finalScore = row.confidence + headBonus + lexicalBonus + categoryPenalty + formPenalty

    return {
      matchedId: row.matched_id,
      matchedName: row.matched_name,
      cosine: row.confidence,
      matchedCategory: row.matched_category,
      embeddingModel: row.embedding_model,
      headBonus,
      lexicalBonus,
      categoryPenalty,
      formPenalty,
      finalScore,
    }
  })

  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    if (b.cosine !== a.cosine) return b.cosine - a.cosine
    return a.matchedName.localeCompare(b.matchedName)
  })

  return candidates
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Embed `searchTerm`, search `ingredient_embeddings` for top-K candidates
 * filtered to `model`, apply the rerank formula, and return the top result.
 *
 * Returns null when:
 *   - Embedding API is unavailable or times out (caller should fall back to LLM).
 *   - No candidates above VECTOR_MIN_COSINE_FLOOR.
 *   - DB query fails.
 */
/**
 * Returns up to `limit` candidates in the mid-confidence band
 * (VECTOR_MATCH_MID_CONFIDENCE ≤ finalScore < VECTOR_MATCH_HIGH_CONFIDENCE).
 * Used for LLM context augmentation (Phase 3b): the caller passes these names
 * into the prompt so the model converges toward existing vocabulary.
 * Returns an empty array on embedding failure — silently degrades to the
 * standard LLM path.
 */
export async function resolveVectorCandidates(
  searchTerm: string,
  model: string,
  limit = 3,
  queryCategory?: string | null,
): Promise<VectorMatchCandidate[]> {
  let embedding: number[] | null
  try {
    embedding = await embedText(searchTerm, model)
  } catch {
    return []
  }

  if (!embedding) return []

  const rawRows = await ingredientEmbeddingsDB.matchVector({ embedding, limit: VECTOR_MATCH_K, model })
  const aboveFloor = rawRows.filter((r) => r.confidence >= VECTOR_MIN_COSINE_FLOOR)
  if (!aboveFloor.length) return []

  const ranked = rerankCandidates(searchTerm, aboveFloor, queryCategory)
  return ranked
    .filter((c) => c.finalScore >= VECTOR_MATCH_MID_CONFIDENCE && c.finalScore < VECTOR_MATCH_HIGH_CONFIDENCE)
    .slice(0, limit)
}

export async function resolveVectorMatch(
  searchTerm: string,
  model: string,
  queryCategory?: string | null,
): Promise<VectorMatchCandidate | null> {
  let embedding: number[] | null
  try {
    embedding = await embedText(searchTerm, model)
  } catch (error) {
    console.warn("[VectorMatch] Embedding unavailable:", (error as Error).message)
    return null
  }

  if (!embedding) return null

  const rawRows = await ingredientEmbeddingsDB.matchVector({
    embedding,
    limit: VECTOR_MATCH_K,
    model,
  })

  const aboveFloor = rawRows.filter((r) => r.confidence >= VECTOR_MIN_COSINE_FLOOR)
  if (!aboveFloor.length) return null

  const ranked = rerankCandidates(searchTerm, aboveFloor, queryCategory)
  return ranked[0] ?? null
}
