export interface RefreshingCache<T> {
  get(forceRefresh?: boolean): Promise<T>
}

/**
 * Creates a self-refreshing in-memory cache with inflight-dedup.
 * On error the stale cached value is served so callers always get a usable result.
 */
export function makeRefreshingCache<T>(options: {
  refreshIntervalMs: number
  fallback: T
  load: () => Promise<T>
  onError?: (error: unknown) => void
}): RefreshingCache<T> {
  let cached: T = options.fallback
  let cachedAt = 0
  let inflightLoad: Promise<T> | null = null

  return {
    get(forceRefresh = false): Promise<T> {
      const now = Date.now()
      if (!forceRefresh && cachedAt > 0 && now - cachedAt < options.refreshIntervalMs) {
        return Promise.resolve(cached)
      }
      if (inflightLoad) return inflightLoad

      inflightLoad = options.load()
        .then((value) => {
          cached = value
          cachedAt = Date.now()
          return value
        })
        .catch((error) => {
          options.onError?.(error)
          return cached
        })
        .finally(() => {
          inflightLoad = null
        })

      return inflightLoad
    },
  }
}
