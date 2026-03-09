import { ingredientMatchQueueDB } from "../../../lib/database/ingredient-match-queue-db"
import { normalizeCanonicalName } from "../../../scripts/utils/canonical-matching"
import { toCanonicalTokens } from "./tokens"
import { makeRefreshingCache } from "../cache/refreshing-cache"

// Don't trust the vocabulary until we have enough distinct canonical documents.
const IDF_VOCABULARY_MIN_DOCUMENTS = 200

// Refresh once per hour — the vocabulary shifts slowly.
const IDF_VOCABULARY_REFRESH_MS = 60 * 60 * 1000

// Tokens whose normalised IDF is at or below this are treated as "known".
// Their contribution to the confidence floor is zero.
// Range [0, 1]. Raise to make the system stricter; lower to be more permissive.
export const IDF_FLOOR_CUTOFF = 0.4

// Maximum confidence floor applied when a name's tokens are completely novel
// (normalised IDF = 1). Quadratic ramp between cutoff and max.
// Range [0, 1].
export const IDF_FLOOR_MAX = 0.6

export interface CanonicalTokenIdfScorer {
  loadedAt: number
  documentCount: number
  /**
   * Returns the IDF-derived confidence floor for a proposed canonical name.
   * Returns -1 when the vocabulary is too small — callers should fall back to
   * the token-count floor.
   */
  getFloor(canonicalName: string): number
}

const FALLBACK_SCORER: CanonicalTokenIdfScorer = {
  loadedAt: 0,
  documentCount: 0,
  getFloor: () => -1,
}

const scorerCache = makeRefreshingCache({
  refreshIntervalMs: IDF_VOCABULARY_REFRESH_MS,
  fallback: FALLBACK_SCORER,
  load: loadScorer,
  onError: (error) =>
    console.warn("[QueueResolver] Failed to load token IDF vocabulary; using fallback floor:", error),
})

function buildScorer(
  documentCount: number,
  tokenDocFreq: Map<string, number>
): CanonicalTokenIdfScorer {
  if (documentCount < IDF_VOCABULARY_MIN_DOCUMENTS) {
    return { ...FALLBACK_SCORER, loadedAt: Date.now() }
  }

  const logN1 = Math.log(documentCount + 1)

  // Normalised IDF: 0 = token in every document (fully familiar), 1 = never seen.
  function normIdf(token: string): number {
    const df = tokenDocFreq.get(token) ?? 0
    return Math.log((documentCount + 1) / (df + 1)) / logN1
  }

  return {
    loadedAt: Date.now(),
    documentCount,
    getFloor(canonicalName: string): number {
      const tokens = toCanonicalTokens(normalizeCanonicalName(canonicalName))
      if (!tokens.length) return -1

      const meanNormIdf = tokens.reduce((sum, t) => sum + normIdf(t), 0) / tokens.length

      // Tokens below the cutoff are "known" — no floor contribution.
      if (meanNormIdf <= IDF_FLOOR_CUTOFF) return 0

      // Above cutoff: quadratic ramp up to IDF_FLOOR_MAX.
      const t = (meanNormIdf - IDF_FLOOR_CUTOFF) / (1 - IDF_FLOOR_CUTOFF)
      return t * t * IDF_FLOOR_MAX
    },
  }
}

async function loadScorer(): Promise<CanonicalTokenIdfScorer> {
  const rows = await ingredientMatchQueueDB.fetchCanonicalTokenIdf()

  if (!rows.length) {
    console.warn("[QueueResolver] Token IDF vocabulary is empty; using fallback floor")
    return { ...FALLBACK_SCORER, loadedAt: Date.now() }
  }

  const documentCount = rows[0].document_count
  const tokenDocFreq = new Map<string, number>()
  for (const row of rows) {
    if (row.token) tokenDocFreq.set(row.token, row.doc_freq)
  }

  const scorer = buildScorer(documentCount, tokenDocFreq)
  console.log(
    `[QueueResolver] Loaded token IDF vocabulary: documents=${documentCount}, unique_tokens=${tokenDocFreq.size}`
  )
  return scorer
}

export async function getCanonicalTokenIdfScorer(forceRefresh = false): Promise<CanonicalTokenIdfScorer> {
  return scorerCache.get(forceRefresh)
}
