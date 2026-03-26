import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getIntEnv,
  normalizeStoreEnum,
  normalizeZipCode,
  parseCitiesCsv,
  normalizeStateCode,
  buildStoreFilterContext,
  hasStoreRangeFilters,
  formatStoreFilterSummary,
  applyStoreRangeFilters,
  truncateText,
  toPriceNumber,
  normalizeResultsShape,
  getProductName,
  mapWithConcurrency,
  emptyBatchResults,
  normalizeBatchResultsShape,
  parseCooldownMsFromMessage,
  runBatchWithCooldownRetry,
} from '../daily-scraper-utils.js'

// ---------------------------------------------------------------------------
// getIntEnv
// ---------------------------------------------------------------------------
describe('getIntEnv', () => {
  beforeEach(() => { delete process.env.__TEST_INT__ })
  afterEach(() => { delete process.env.__TEST_INT__ })

  it('returns the parsed env value when set and valid', () => {
    process.env.__TEST_INT__ = '42'
    expect(getIntEnv('__TEST_INT__', 0)).toBe(42)
  })

  it('returns the fallback when env is not set', () => {
    expect(getIntEnv('__TEST_INT__', 99)).toBe(99)
  })

  it('returns the fallback for non-numeric values', () => {
    process.env.__TEST_INT__ = 'abc'
    expect(getIntEnv('__TEST_INT__', 5)).toBe(5)
  })

  it('returns the fallback when value is below minValue', () => {
    process.env.__TEST_INT__ = '0'
    expect(getIntEnv('__TEST_INT__', 10, 1)).toBe(10)
  })

  it('accepts a value equal to minValue', () => {
    process.env.__TEST_INT__ = '1'
    expect(getIntEnv('__TEST_INT__', 10, 1)).toBe(1)
  })

  it('accepts minValue = 0 with a zero env value', () => {
    process.env.__TEST_INT__ = '0'
    expect(getIntEnv('__TEST_INT__', 5, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// normalizeStoreEnum
// ---------------------------------------------------------------------------
describe('normalizeStoreEnum', () => {
  it('lowercases the value', () => {
    expect(normalizeStoreEnum('Walmart')).toBe('walmart')
  })

  it('trims whitespace', () => {
    expect(normalizeStoreEnum('  kroger  ')).toBe('kroger')
  })

  it('returns empty string for null', () => {
    expect(normalizeStoreEnum(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(normalizeStoreEnum(undefined)).toBe('')
  })

  it('handles numbers', () => {
    expect(normalizeStoreEnum(99)).toBe('99')
  })
})

// ---------------------------------------------------------------------------
// normalizeZipCode
// ---------------------------------------------------------------------------
describe('normalizeZipCode', () => {
  it('returns 5-digit zip from a plain 5-digit string', () => {
    expect(normalizeZipCode('94704')).toBe('94704')
  })

  it('extracts first 5 digits from zip+4 format', () => {
    expect(normalizeZipCode('94704-1234')).toBe('94704')
  })

  it('returns empty string for non-numeric input', () => {
    expect(normalizeZipCode('ABCDE')).toBe('')
  })

  it('returns empty string for null', () => {
    expect(normalizeZipCode(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(normalizeZipCode(undefined)).toBe('')
  })

  it('returns empty string for a zip shorter than 5 digits', () => {
    expect(normalizeZipCode('1234')).toBe('')
  })

  it('handles numeric values', () => {
    expect(normalizeZipCode(90210)).toBe('90210')
  })
})

// ---------------------------------------------------------------------------
// parseCitiesCsv
// ---------------------------------------------------------------------------
describe('parseCitiesCsv', () => {
  it('parses a comma-separated list of cities', () => {
    expect(parseCitiesCsv('Chicago, Austin, Denver')).toEqual(['Chicago', 'Austin', 'Denver'])
  })

  it('deduplicates cities', () => {
    expect(parseCitiesCsv('Chicago,Chicago,Denver')).toEqual(['Chicago', 'Denver'])
  })

  it('filters out empty entries', () => {
    expect(parseCitiesCsv('Chicago,,Denver')).toEqual(['Chicago', 'Denver'])
  })

  it('returns [] for null', () => {
    expect(parseCitiesCsv(null)).toEqual([])
  })

  it('returns [] for empty string', () => {
    expect(parseCitiesCsv('')).toEqual([])
  })

  it('handles a single city', () => {
    expect(parseCitiesCsv('Seattle')).toEqual(['Seattle'])
  })
})

// ---------------------------------------------------------------------------
// normalizeStateCode
// ---------------------------------------------------------------------------
describe('normalizeStateCode', () => {
  it('returns the 2-letter state code uppercased', () => {
    expect(normalizeStateCode('ca')).toBe('CA')
  })

  it('returns empty string for codes longer than 2 letters', () => {
    expect(normalizeStateCode('CAL')).toBe('')
  })

  it('returns empty string for null', () => {
    expect(normalizeStateCode(null)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(normalizeStateCode('')).toBe('')
  })

  it('handles an already uppercase code', () => {
    expect(normalizeStateCode('TX')).toBe('TX')
  })
})

// ---------------------------------------------------------------------------
// buildStoreFilterContext
// ---------------------------------------------------------------------------
describe('buildStoreFilterContext', () => {
  it('builds a context with all fields', () => {
    const ctx = buildStoreFilterContext({
      storeState: 'CA',
      storeCity: 'Oakland',
      storeCitiesCsv: 'Oakland,Berkeley',
      storeZipMin: '94600',
      storeZipMax: '94699',
    })
    expect(ctx.stateCode).toBe('CA')
    expect(ctx.city).toBe('Oakland')
    expect(ctx.cities).toEqual(['Oakland', 'Berkeley'])
    expect(ctx.zipMin).toBe('94600')
    expect(ctx.zipMax).toBe('94699')
  })

  it('returns empty defaults when called with no args', () => {
    const ctx = buildStoreFilterContext()
    expect(ctx.stateCode).toBe('')
    expect(ctx.city).toBeNull()
    expect(ctx.cities).toEqual([])
    expect(ctx.zipMin).toBeNull()
    expect(ctx.zipMax).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// hasStoreRangeFilters
// ---------------------------------------------------------------------------
describe('hasStoreRangeFilters', () => {
  it('returns true when stateCode is set', () => {
    expect(hasStoreRangeFilters({ stateCode: 'CA', city: null, cities: [], zipMin: null, zipMax: null })).toBe(true)
  })

  it('returns true when city is set', () => {
    expect(hasStoreRangeFilters({ stateCode: '', city: 'Denver', cities: [], zipMin: null, zipMax: null })).toBe(true)
  })

  it('returns true when cities array is non-empty', () => {
    expect(hasStoreRangeFilters({ stateCode: '', city: null, cities: ['Austin'], zipMin: null, zipMax: null })).toBe(true)
  })

  it('returns true when zipMin is set', () => {
    expect(hasStoreRangeFilters({ stateCode: '', city: null, cities: [], zipMin: '10000', zipMax: null })).toBe(true)
  })

  it('returns false when all fields are empty/null', () => {
    expect(hasStoreRangeFilters({ stateCode: '', city: null, cities: [], zipMin: null, zipMax: null })).toBe(false)
  })

  it('returns false for null context', () => {
    expect(hasStoreRangeFilters(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formatStoreFilterSummary
// ---------------------------------------------------------------------------
describe('formatStoreFilterSummary', () => {
  it('formats all fields', () => {
    const ctx = { stateCode: 'CA', city: null, cities: ['Oakland', 'Berkeley'], zipMin: '94600', zipMax: '94699' }
    const summary = formatStoreFilterSummary(ctx)
    expect(summary).toContain('CA')
    expect(summary).toContain('Oakland')
    expect(summary).toContain('Berkeley')
    expect(summary).toContain('94600')
    expect(summary).toContain('94699')
  })

  it('falls back to ALL/NONE for missing values', () => {
    const ctx = { stateCode: '', city: null, cities: [], zipMin: null, zipMax: null }
    const summary = formatStoreFilterSummary(ctx)
    expect(summary).toContain('ALL')
    expect(summary).toContain('NONE')
  })

  it('uses single city when cities array is empty', () => {
    const ctx = { stateCode: '', city: 'Portland', cities: [], zipMin: null, zipMax: null }
    expect(formatStoreFilterSummary(ctx)).toContain('Portland')
  })
})

// ---------------------------------------------------------------------------
// applyStoreRangeFilters
// ---------------------------------------------------------------------------
describe('applyStoreRangeFilters', () => {
  function makeQuery() {
    const calls = []
    const q = {
      gte: vi.fn((col, val) => { calls.push(['gte', col, val]); return q }),
      lte: vi.fn((col, val) => { calls.push(['lte', col, val]); return q }),
      eq: vi.fn((col, val) => { calls.push(['eq', col, val]); return q }),
      in: vi.fn((col, vals) => { calls.push(['in', col, vals]); return q }),
      _calls: calls,
    }
    return q
  }

  it('returns the query unchanged when filter context has no active filters', () => {
    const q = makeQuery()
    const result = applyStoreRangeFilters(q, { stateCode: '', city: null, cities: [], zipMin: null, zipMax: null })
    expect(result).toBe(q)
    expect(q._calls).toHaveLength(0)
  })

  it('applies gte for zipMin', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: '', city: null, cities: [], zipMin: '90000', zipMax: null })
    expect(q._calls).toContainEqual(['gte', 'zip_code', '90000'])
  })

  it('applies lte for zipMax', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: '', city: null, cities: [], zipMin: null, zipMax: '99999' })
    expect(q._calls).toContainEqual(['lte', 'zip_code', '99999'])
  })

  it('applies eq for stateCode', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: 'TX', city: null, cities: [], zipMin: null, zipMax: null })
    expect(q._calls).toContainEqual(['eq', 'state', 'TX'])
  })

  it('applies in() for cities array', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: '', city: null, cities: ['Austin', 'Dallas'], zipMin: null, zipMax: null })
    expect(q._calls).toContainEqual(['in', 'city', ['Austin', 'Dallas']])
  })

  it('applies eq for single city when cities array is empty', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: '', city: 'Seattle', cities: [], zipMin: null, zipMax: null })
    expect(q._calls).toContainEqual(['eq', 'city', 'Seattle'])
  })

  it('cities array takes precedence over single city', () => {
    const q = makeQuery()
    applyStoreRangeFilters(q, { stateCode: '', city: 'Seattle', cities: ['Portland'], zipMin: null, zipMax: null })
    const hasCitiesIn = q._calls.some(c => c[0] === 'in')
    const hasSingleEq = q._calls.some(c => c[0] === 'eq' && c[2] === 'Seattle')
    expect(hasCitiesIn).toBe(true)
    expect(hasSingleEq).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// truncateText
// ---------------------------------------------------------------------------
describe('truncateText', () => {
  it('returns empty string for null', () => {
    expect(truncateText(null)).toBe('')
  })

  it('returns the text unchanged when under max length', () => {
    expect(truncateText('hello world')).toBe('hello world')
  })

  it('truncates and appends "..." when over max length', () => {
    const long = 'a'.repeat(400)
    const result = truncateText(long)
    expect(result).toHaveLength(320)
    expect(result.endsWith('...')).toBe(true)
  })

  it('collapses internal whitespace', () => {
    expect(truncateText('hello    world')).toBe('hello world')
  })

  it('respects a custom maxLength', () => {
    const result = truncateText('hello world', 8)
    expect(result).toHaveLength(8)
    expect(result).toBe('hello...')
  })
})

// ---------------------------------------------------------------------------
// toPriceNumber
// ---------------------------------------------------------------------------
describe('toPriceNumber', () => {
  it('returns a finite number as-is', () => {
    expect(toPriceNumber(3.99)).toBe(3.99)
  })

  it('returns null for NaN / Infinity', () => {
    expect(toPriceNumber(NaN)).toBeNull()
    expect(toPriceNumber(Infinity)).toBeNull()
  })

  it('parses a dollar-sign string', () => {
    expect(toPriceNumber('$4.99')).toBe(4.99)
  })

  it('parses a plain numeric string', () => {
    expect(toPriceNumber('2.50')).toBe(2.5)
  })

  it('returns null for a non-numeric string', () => {
    expect(toPriceNumber('N/A')).toBeNull()
  })

  it('returns null for null', () => {
    expect(toPriceNumber(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(toPriceNumber(undefined)).toBeNull()
  })

  it('handles zero', () => {
    expect(toPriceNumber(0)).toBe(0)
  })

  it('handles string zero', () => {
    expect(toPriceNumber('0')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// normalizeResultsShape
// ---------------------------------------------------------------------------
describe('normalizeResultsShape', () => {
  it('returns an array unchanged', () => {
    const arr = [{ price: 1 }]
    expect(normalizeResultsShape(arr)).toBe(arr)
  })

  it('unwraps an object with .items array', () => {
    const items = [{ price: 1 }]
    expect(normalizeResultsShape({ items })).toBe(items)
  })

  it('returns [] for null', () => {
    expect(normalizeResultsShape(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(normalizeResultsShape(undefined)).toEqual([])
  })

  it('returns [] for a plain object without .items', () => {
    expect(normalizeResultsShape({ price: 1 })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getProductName
// ---------------------------------------------------------------------------
describe('getProductName', () => {
  it('returns the product_name field', () => {
    expect(getProductName({ product_name: 'Organic Milk' }, 'milk')).toBe('Organic Milk')
  })

  it('falls back to title', () => {
    expect(getProductName({ title: 'Whole Milk 1 gal' }, 'milk')).toBe('Whole Milk 1 gal')
  })

  it('falls back to name', () => {
    expect(getProductName({ name: 'Skim Milk' }, 'milk')).toBe('Skim Milk')
  })

  it('falls back to description', () => {
    expect(getProductName({ description: 'Two-percent milk' }, 'milk')).toBe('Two-percent milk')
  })

  it('falls back to fallbackIngredient when no fields present', () => {
    expect(getProductName({}, 'milk')).toBe('milk')
  })

  it('appends unit hint when name has no embedded unit token', () => {
    const result = getProductName({ product_name: 'Milk', unit: '1 gal' }, 'milk')
    expect(result).toBe('Milk 1 gal')
  })

  it('does not duplicate the unit when already embedded in the name', () => {
    const result = getProductName({ product_name: 'Milk 1 gal', unit: '1 gal' }, 'milk')
    expect(result).toBe('Milk 1 gal')
  })

  it('does not append unit when name already contains an embedded unit token', () => {
    const result = getProductName({ product_name: 'Chicken Breast 3 lb', unit: '3 lb' }, 'chicken')
    expect(result).toBe('Chicken Breast 3 lb')
  })

  it('returns null for an empty result and no fallback', () => {
    expect(getProductName({}, '')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// mapWithConcurrency
// ---------------------------------------------------------------------------
describe('mapWithConcurrency', () => {
  it('maps all items and preserves order', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await mapWithConcurrency(items, 2, async n => n * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('returns [] for an empty array', async () => {
    expect(await mapWithConcurrency([], 3, async x => x)).toEqual([])
  })

  it('handles concurrency > items.length', async () => {
    const items = [1, 2]
    const results = await mapWithConcurrency(items, 100, async n => n + 1)
    expect(results).toEqual([2, 3])
  })

  it('handles concurrency = 1 (sequential)', async () => {
    const order = []
    const items = [1, 2, 3]
    await mapWithConcurrency(items, 1, async n => { order.push(n); return n })
    expect(order).toEqual([1, 2, 3])
  })

  it('propagates errors from the mapper', async () => {
    await expect(
      mapWithConcurrency([1], 1, async () => { throw new Error('boom') })
    ).rejects.toThrow('boom')
  })
})

// ---------------------------------------------------------------------------
// emptyBatchResults
// ---------------------------------------------------------------------------
describe('emptyBatchResults', () => {
  it('returns an array of the given size filled with empty arrays', () => {
    const result = emptyBatchResults(3)
    expect(result).toHaveLength(3)
    result.forEach(r => expect(r).toEqual([]))
  })

  it('returns [] for size 0', () => {
    expect(emptyBatchResults(0)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// normalizeBatchResultsShape
// ---------------------------------------------------------------------------
describe('normalizeBatchResultsShape', () => {
  it('normalizes each entry in the batch', () => {
    const batch = [
      [{ price: 1 }],
      { items: [{ price: 2 }] },
      null,
    ]
    const result = normalizeBatchResultsShape(batch, 3)
    expect(result[0]).toEqual([{ price: 1 }])
    expect(result[1]).toEqual([{ price: 2 }])
    expect(result[2]).toEqual([])
  })

  it('returns emptyBatchResults when rawBatchResults is not an array', () => {
    expect(normalizeBatchResultsShape(null, 2)).toEqual([[], []])
    expect(normalizeBatchResultsShape(undefined, 3)).toEqual([[], [], []])
  })

  it('pads with empty arrays when rawBatchResults is shorter than expectedLength', () => {
    const result = normalizeBatchResultsShape([[{ price: 1 }]], 3)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual([])
    expect(result[2]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// parseCooldownMsFromMessage
// ---------------------------------------------------------------------------
describe('parseCooldownMsFromMessage', () => {
  it('parses duration from traderjoes jina cooldown message', () => {
    expect(parseCooldownMsFromMessage('[traderjoes] Jina cooldown active for 74746ms')).toBe(74746)
  })

  it('parses duration from generic jina-crawler cooldown message', () => {
    expect(parseCooldownMsFromMessage('[traderjoes] cooldown active for 90000ms')).toBe(90000)
  })

  it('returns 0 when no duration is present', () => {
    expect(parseCooldownMsFromMessage('rate limit exceeded')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseCooldownMsFromMessage('')).toBe(0)
  })

  it('returns 0 for null/undefined', () => {
    expect(parseCooldownMsFromMessage(null)).toBe(0)
    expect(parseCooldownMsFromMessage(undefined)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// runBatchWithCooldownRetry
// ---------------------------------------------------------------------------
describe('runBatchWithCooldownRetry', () => {
  const baseOpts = {
    storeEnum: 'traderjoes',
    code: 'TJ_JINA_COOLDOWN',
    ingredientCount: 3,
  }

  it('sleeps for cooldownRemainingMs + 2000 and returns retry results on success', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    const retryData = [
      [{ product_name: 'Milk', price: 3.99 }],
      [],
      [{ product_name: 'Bread', price: 2.49 }],
    ]
    const runBatch = vi.fn().mockResolvedValue(retryData)

    const result = await runBatchWithCooldownRetry({
      ...baseOpts,
      message: '[traderjoes] Jina cooldown active for 74746ms',
      runBatch,
      sleepFn,
    })

    expect(sleepFn).toHaveBeenCalledWith(76746) // 74746 + 2000
    expect(runBatch).toHaveBeenCalledOnce()
    expect(result._retrySucceeded).toBe(true)
    expect(result.errorFlags).toEqual([false, false, false])
    expect(result.errorMessages).toEqual(['', '', ''])
    expect(result.resultsByIngredient).toHaveLength(3)
  })

  it('caps sleep at 120000ms even for very long cooldowns', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    const runBatch = vi.fn().mockResolvedValue([[], [], []])

    await runBatchWithCooldownRetry({
      ...baseOpts,
      message: 'cooldown active for 200000ms',
      runBatch,
      sleepFn,
    })

    expect(sleepFn).toHaveBeenCalledWith(120000)
  })

  it('returns all errors when retry also fails', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    const runBatch = vi.fn().mockRejectedValue(new Error('still rate limited'))

    const result = await runBatchWithCooldownRetry({
      ...baseOpts,
      message: '[traderjoes] Jina cooldown active for 5000ms',
      runBatch,
      sleepFn,
    })

    expect(sleepFn).toHaveBeenCalledOnce()
    expect(runBatch).toHaveBeenCalledOnce()
    expect(result._retrySucceeded).toBe(false)
    expect(result.errorFlags).toEqual([true, true, true])
    expect(result.errorMessages).toEqual([
      '[traderjoes] Jina cooldown active for 5000ms',
      '[traderjoes] Jina cooldown active for 5000ms',
      '[traderjoes] Jina cooldown active for 5000ms',
    ])
    expect(result.errorCodes).toEqual(['TJ_JINA_COOLDOWN', 'TJ_JINA_COOLDOWN', 'TJ_JINA_COOLDOWN'])
  })

  it('skips sleep and retry when no cooldown duration in message', async () => {
    const sleepFn = vi.fn()
    const runBatch = vi.fn()

    const result = await runBatchWithCooldownRetry({
      ...baseOpts,
      message: '429 Too Many Requests',
      runBatch,
      sleepFn,
    })

    expect(sleepFn).not.toHaveBeenCalled()
    expect(runBatch).not.toHaveBeenCalled()
    expect(result._retrySucceeded).toBe(false)
    expect(result.errorFlags).toEqual([true, true, true])
  })
})
