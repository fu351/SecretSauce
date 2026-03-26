import {
  ingredientMatchQueueDB,
  type CanonicalCreationProbationStats,
} from "../../../lib/database/ingredient-match-queue-db"
import { normalizeCanonicalName } from "../../../backend/scripts/utils/canonical-matching"

const PROBATION_CACHE_MAX_ENTRIES = 20000
const PROBATION_CACHE_TTL_BELOW_THRESHOLD_MS = 30 * 1000
const PROBATION_CACHE_TTL_AT_OR_ABOVE_THRESHOLD_MS = 10 * 60 * 1000

type CacheEntry = {
  stats: CanonicalCreationProbationStats
  updatedAtMs: number
  ttlMs: number
}

class LocalProbationCache {
  private entries = new Map<string, CacheEntry>()
  private inflight = new Map<string, Promise<CanonicalCreationProbationStats | null>>()

  private toCacheKey(canonicalName: string, sourceSignature: string): string {
    const canonical = normalizeCanonicalName(canonicalName)
    const signature = sourceSignature.trim().toLowerCase()
    return `${canonical}|${signature}`
  }

  private pruneIfNeeded(): void {
    if (this.entries.size <= PROBATION_CACHE_MAX_ENTRIES) return

    const sortedByAge = Array.from(this.entries.entries()).sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs)
    const toDelete = this.entries.size - PROBATION_CACHE_MAX_ENTRIES
    for (let i = 0; i < toDelete; i += 1) {
      this.entries.delete(sortedByAge[i][0])
    }
  }

  private getIfFresh(key: string): CanonicalCreationProbationStats | null {
    const entry = this.entries.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.updatedAtMs > entry.ttlMs) {
      this.entries.delete(key)
      return null
    }

    return entry.stats
  }

  async track(params: {
    canonicalName: string
    sourceSignature: string
    source?: string | null
    minDistinctSourcesForLongTtl: number
  }): Promise<CanonicalCreationProbationStats | null> {
    const { canonicalName, sourceSignature, source, minDistinctSourcesForLongTtl } = params
    const key = this.toCacheKey(canonicalName, sourceSignature)

    const cached = this.getIfFresh(key)
    if (cached) {
      return cached
    }

    const existingInflight = this.inflight.get(key)
    if (existingInflight) {
      return existingInflight
    }

    const promise = ingredientMatchQueueDB
      .trackCanonicalCreationProbation({
        canonicalName,
        sourceSignature,
        source,
      })
      .then((stats) => {
        if (!stats) return null

        const ttlMs =
          stats.distinctSources >= minDistinctSourcesForLongTtl
            ? PROBATION_CACHE_TTL_AT_OR_ABOVE_THRESHOLD_MS
            : PROBATION_CACHE_TTL_BELOW_THRESHOLD_MS

        this.entries.set(key, {
          stats,
          updatedAtMs: Date.now(),
          ttlMs,
        })
        this.pruneIfNeeded()
        return stats
      })
      .finally(() => {
        this.inflight.delete(key)
      })

    this.inflight.set(key, promise)
    return promise
  }
}

export const localProbationCache = new LocalProbationCache()
