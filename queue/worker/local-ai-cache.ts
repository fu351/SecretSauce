type CacheNamespace = "ingredient" | "unit"

type CacheRecord = {
  value: unknown
  updatedAt: string
  hitCount: number
}

const DEFAULT_MAX_ENTRIES = 50000

function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

class LocalQueueAICache {
  private entries = new Map<string, CacheRecord>()
  private readonly maxEntries = asPositiveInt(process.env.QUEUE_LOCAL_CACHE_MAX_ENTRIES, DEFAULT_MAX_ENTRIES)

  private compositeKey(namespace: CacheNamespace, cacheVersion: string, key: string): string {
    return `${namespace}|${cacheVersion}|${key}`
  }

  private pruneIfNeeded(): void {
    if (this.entries.size <= this.maxEntries) return
    const items = Array.from(this.entries.entries()).sort((a, b) => {
      const aTs = Date.parse(a[1].updatedAt) || 0
      const bTs = Date.parse(b[1].updatedAt) || 0
      return aTs - bTs
    })
    const toRemove = Math.max(0, this.entries.size - this.maxEntries)
    for (let i = 0; i < toRemove; i += 1) {
      this.entries.delete(items[i][0])
    }
  }

  async getMany<T>(params: {
    namespace: CacheNamespace
    cacheVersion: string
    keys: string[]
    maxAgeDays: number
  }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    if (!params.keys.length) return result

    const now = Date.now()
    const maxAgeMs = Math.max(0, params.maxAgeDays) * 24 * 60 * 60 * 1000

    for (const key of params.keys) {
      const composite = this.compositeKey(params.namespace, params.cacheVersion, key)
      const record = this.entries.get(composite)
      if (!record) continue

      const updatedAtMs = Date.parse(record.updatedAt)
      if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > maxAgeMs) {
        this.entries.delete(composite)
        continue
      }

      record.hitCount += 1
      record.updatedAt = new Date(now).toISOString()
      result.set(key, record.value as T)
    }

    return result
  }

  async setMany(params: {
    namespace: CacheNamespace
    cacheVersion: string
    entries: Array<{ key: string; value: unknown }>
  }): Promise<void> {
    if (!params.entries.length) return

    const nowIso = new Date().toISOString()
    for (const item of params.entries) {
      const composite = this.compositeKey(params.namespace, params.cacheVersion, item.key)
      const existing = this.entries.get(composite)
      this.entries.set(composite, {
        value: item.value,
        updatedAt: nowIso,
        hitCount: existing?.hitCount ?? 0,
      })
    }

    this.pruneIfNeeded()
  }

  async flush(): Promise<void> {
    return
  }
}

export const localQueueAICache = new LocalQueueAICache()
