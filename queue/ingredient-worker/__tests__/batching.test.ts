import { describe, it, expect, vi } from 'vitest'
import { chunkItems, mapWithConcurrency } from '../batching'

describe('chunkItems', () => {
  it('returns empty array for empty input', () => {
    expect(chunkItems([], 3)).toEqual([])
  })

  it('splits into equal chunks', () => {
    expect(chunkItems([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('handles remainder in last chunk', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('chunk size 1 puts each item in its own array', () => {
    expect(chunkItems(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })

  it('chunk size >= array length returns single chunk', () => {
    expect(chunkItems([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('floors fractional chunk size', () => {
    // 2.9 → floor → 2
    expect(chunkItems([1, 2, 3, 4], 2.9)).toEqual([[1, 2], [3, 4]])
  })

  it('treats zero chunk size as 1', () => {
    expect(chunkItems([1, 2], 0)).toEqual([[1], [2]])
  })

  it('treats negative chunk size as 1', () => {
    expect(chunkItems([1, 2], -5)).toEqual([[1], [2]])
  })

  it('preserves item types', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const chunks = chunkItems(items, 2)
    expect(chunks[0][0]).toBe(items[0])
    expect(chunks[0][1]).toBe(items[1])
    expect(chunks[1][0]).toBe(items[2])
  })
})

describe('mapWithConcurrency', () => {
  it('returns empty array for empty input', async () => {
    const result = await mapWithConcurrency([], 3, async (x) => x)
    expect(result).toEqual([])
  })

  it('processes all items and returns results', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, async (x) => x * 2)
    expect(result).toEqual([2, 4, 6])
  })

  it('preserves output order regardless of concurrency', async () => {
    const delays = [30, 10, 20]
    const result = await mapWithConcurrency([0, 1, 2], 3, async (_, i) => {
      await new Promise((resolve) => setTimeout(resolve, delays[i]))
      return i
    })
    expect(result).toEqual([0, 1, 2])
  })

  it('respects concurrency limit — only N workers run at a time', async () => {
    let active = 0
    let maxActive = 0

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active--
    })

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('concurrency 1 processes items sequentially', async () => {
    const order: number[] = []
    await mapWithConcurrency([0, 1, 2], 1, async (_, i) => {
      order.push(i)
    })
    expect(order).toEqual([0, 1, 2])
  })

  it('handles concurrency larger than item count', async () => {
    const result = await mapWithConcurrency([10, 20], 100, async (x) => x + 1)
    expect(result).toEqual([11, 21])
  })

  it('floors fractional concurrency', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2.9, async (x) => x)
    expect(result).toEqual([1, 2, 3])
  })

  it('treats zero concurrency as 1', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 0, async (x) => x * 10)
    expect(result).toEqual([10, 20, 30])
  })

  it('passes correct index to worker', async () => {
    const indices: number[] = []
    await mapWithConcurrency(['a', 'b', 'c'], 1, async (_, i) => {
      indices.push(i)
    })
    expect(indices).toEqual([0, 1, 2])
  })

  it('propagates worker errors', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 1, async (x) => {
        if (x === 2) throw new Error('bad item')
        return x
      })
    ).rejects.toThrow('bad item')
  })
})
