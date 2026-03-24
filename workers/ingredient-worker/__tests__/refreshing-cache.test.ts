import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRefreshingCache } from '../cache/refreshing-cache'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('makeRefreshingCache', () => {
  it('returns the loaded value on first get()', async () => {
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback-value',
      load: async () => 'loaded',
    })

    const value = await cache.get()
    expect(value).toBe('loaded')
  })

  it('serves the fallback when load throws immediately', async () => {
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'my-fallback',
      load: async () => { throw new Error('load failed') },
    })

    const value = await cache.get()
    expect(value).toBe('my-fallback')
  })

  it('loads and caches the value on first successful get()', async () => {
    const load = vi.fn().mockResolvedValue('loaded-value')
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    const v1 = await cache.get()
    expect(v1).toBe('loaded-value')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('serves cached value within the refresh interval without re-loading', async () => {
    const load = vi.fn().mockResolvedValue('data')
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    await cache.get()
    vi.advanceTimersByTime(30_000) // half the interval
    await cache.get()
    await cache.get()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('re-loads after the refresh interval expires', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    const v1 = await cache.get()
    expect(v1).toBe('first')

    vi.advanceTimersByTime(60_001)
    const v2 = await cache.get()
    expect(v2).toBe('second')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent inflight loads — only one load() call', async () => {
    let resolveLoad!: (v: string) => void
    const load = vi.fn(() => new Promise<string>((r) => { resolveLoad = r }))
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    const p1 = cache.get()
    const p2 = cache.get()
    const p3 = cache.get()

    resolveLoad('concurrent-value')
    const [v1, v2, v3] = await Promise.all([p1, p2, p3])

    expect(load).toHaveBeenCalledTimes(1)
    expect(v1).toBe('concurrent-value')
    expect(v2).toBe('concurrent-value')
    expect(v3).toBe('concurrent-value')
  })

  it('serves stale cached value when a reload fails', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce('stale-value')
      .mockRejectedValueOnce(new Error('network error'))
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    const v1 = await cache.get()
    expect(v1).toBe('stale-value')

    vi.advanceTimersByTime(60_001)
    const v2 = await cache.get()
    expect(v2).toBe('stale-value') // stale, not fallback
  })

  it('calls onError handler when load fails', async () => {
    const onError = vi.fn()
    const error = new Error('oops')
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load: async () => { throw error },
      onError,
    })

    await cache.get()
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('forceRefresh=true bypasses the cache and triggers a reload', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('forced')
    const cache = makeRefreshingCache({
      refreshIntervalMs: 60_000,
      fallback: 'fallback',
      load,
    })

    await cache.get()
    const v2 = await cache.get(true)

    expect(load).toHaveBeenCalledTimes(2)
    expect(v2).toBe('forced')
  })

  it('works with complex object types', async () => {
    type Config = { threshold: number; items: string[] }
    const cache = makeRefreshingCache<Config>({
      refreshIntervalMs: 1_000,
      fallback: { threshold: 0, items: [] },
      load: async () => ({ threshold: 0.9, items: ['a', 'b'] }),
    })

    const result = await cache.get()
    expect(result.threshold).toBe(0.9)
    expect(result.items).toEqual(['a', 'b'])
  })
})
