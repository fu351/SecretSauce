import { describe, expect, it, vi } from 'vitest'
import { createResultCache } from '../result-cache'

describe('createResultCache', () => {
  it('builds normalized keys from keyword and zip', () => {
    const cache = createResultCache()
    expect(cache.buildKey('  Milk ', ' 94704 ')).toBe('milk::94704')
    expect(cache.buildKey('', '94704')).toBe('::94704')
  })

  it('expires stale entries on read and sweep', () => {
    vi.useFakeTimers()
    const cache = createResultCache({ ttlMs: 100 })

    cache.set('milk::94704', ['a'])
    vi.advanceTimersByTime(101)

    expect(cache.get('milk::94704')).toBeNull()

    cache.set('bread::94704', ['b'])
    vi.advanceTimersByTime(101)
    cache.sweep()

    expect(cache.get('bread::94704')).toBeNull()
    vi.useRealTimers()
  })

  it('evicts oldest entries when maxEntries is exceeded', () => {
    const cache = createResultCache({ maxEntries: 2 })

    cache.set('milk::94704', ['milk'])
    cache.set('bread::94704', ['bread'])
    cache.set('eggs::94704', ['eggs'])

    expect(cache.get('milk::94704')).toBeNull()
    expect(cache.get('bread::94704')).toEqual(['bread'])
    expect(cache.get('eggs::94704')).toEqual(['eggs'])
  })

  it('tracks in-flight promises separately from cached results', async () => {
    const cache = createResultCache()
    const promise = Promise.resolve(['milk'])

    cache.setInFlight('milk::94704', promise)

    expect(cache.getInFlight('milk::94704')).toBe(promise)

    cache.deleteInFlight('milk::94704')

    expect(cache.getInFlight('milk::94704')).toBeUndefined()
  })

  it('deduplicates items while preserving items without keys', () => {
    const cache = createResultCache()
    const onDuplicate = vi.fn()

    const results = cache.dedupe(
      [
        { id: '1', title: 'Milk A' },
        { id: '1', title: 'Milk B' },
        { title: 'No Key A' },
        { title: 'No Key B' },
      ],
      {
        getKey: (item) => item.id,
        onDuplicate,
      },
    )

    expect(results).toEqual([
      { id: '1', title: 'Milk A' },
      { title: 'No Key A' },
      { title: 'No Key B' },
    ])
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(onDuplicate).toHaveBeenCalledWith({ id: '1', title: 'Milk B' }, '1')
  })

  it('supports incremental dedupe for merged scraper results', () => {
    const cache = createResultCache()
    const deduper = cache.createDeduper({
      getKey: (item) => item.product_id || `${item.title}-${item.price}`,
    })

    deduper.addMany([
      { product_id: 'A', title: 'Milk', price: 3.99 },
      { product_id: 'A', title: 'Milk duplicate', price: 3.99 },
    ])
    deduper.add({ title: 'Bread', price: 2.49 })
    deduper.add({ title: 'Bread', price: 2.49 })

    expect(deduper.values()).toEqual([
      { product_id: 'A', title: 'Milk', price: 3.99 },
      { title: 'Bread', price: 2.49 },
    ])
    expect(deduper.size()).toBe(2)
  })
})
