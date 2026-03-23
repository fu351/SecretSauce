import { describe, it, expect } from 'vitest'
import type { IngredientMatchQueueRow } from '../../../lib/database/ingredient-match-queue-db'
import {
  hasUnitAlias,
  hasExplicitUnitSignals,
  shouldUsePackagedUnitFallback,
  shouldUsePackagedUnitFallbackAfterFailure,
  buildPackagedUnitFallback,
  isPackagedUnitFallbackResult,
  collectUnitHints,
  stripMeasurementFromSearchTerm,
  UNIT_FALLBACK_CONFIDENCE,
} from '../unit-resolution-utils'

function makeRow(fields: Partial<IngredientMatchQueueRow> = {}): IngredientMatchQueueRow {
  return {
    id: 'test-id',
    source: 'scraper',
    raw_unit: null,
    cleaned_name: null,
    raw_product_name: null,
    resolved_unit: null,
    ...fields,
  } as IngredientMatchQueueRow
}

describe('hasUnitAlias', () => {
  it('returns false for empty raw string', () => {
    expect(hasUnitAlias('', 'oz')).toBe(false)
  })

  it('returns false for empty alias', () => {
    expect(hasUnitAlias('12 oz chicken', '')).toBe(false)
  })

  it('matches exact alias at word boundary', () => {
    expect(hasUnitAlias('12 oz chicken', 'oz')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(hasUnitAlias('12 OZ chicken', 'oz')).toBe(true)
    expect(hasUnitAlias('2 Cups flour', 'cups')).toBe(true)
  })

  it('does not match partial word (no word boundary)', () => {
    // "ounces" should not match alias "oz" since letters precede/follow
    expect(hasUnitAlias('2ounces flour', 'oz')).toBe(false)
  })

  it('matches multi-word alias', () => {
    expect(hasUnitAlias('16 fluid ounces water', 'fluid ounces')).toBe(true)
  })

  it('multi-word alias allows flexible separators', () => {
    expect(hasUnitAlias('16 fl.oz water', 'fl oz')).toBe(true)
  })

  it('matches alias at start of string', () => {
    expect(hasUnitAlias('oz chicken', 'oz')).toBe(true)
  })

  it('matches alias at end of string', () => {
    expect(hasUnitAlias('chicken 12oz', 'oz')).toBe(true)
  })
})

describe('hasExplicitUnitSignals', () => {
  it('returns true when raw_unit is present', () => {
    const row = makeRow({ raw_unit: 'oz' })
    expect(hasExplicitUnitSignals(row)).toBe(true)
  })

  it('returns true when cleaned_name contains a known unit', () => {
    const row = makeRow({ cleaned_name: '2 cups flour' })
    expect(hasExplicitUnitSignals(row)).toBe(true)
  })

  it('returns true when raw_product_name contains a known unit', () => {
    const row = makeRow({ raw_product_name: 'chicken 16 oz pack' })
    expect(hasExplicitUnitSignals(row)).toBe(true)
  })

  it('returns false when no unit signals found', () => {
    const row = makeRow({ cleaned_name: 'olive oil', raw_product_name: 'extra virgin olive oil' })
    expect(hasExplicitUnitSignals(row)).toBe(false)
  })

  it('returns true for "dozen" in product name', () => {
    const row = makeRow({ raw_product_name: 'dozen eggs' })
    expect(hasExplicitUnitSignals(row)).toBe(true)
  })
})

describe('shouldUsePackagedUnitFallback', () => {
  it('returns false when source is not scraper', () => {
    const row = makeRow({ source: 'recipe', cleaned_name: 'olive oil' })
    expect(shouldUsePackagedUnitFallback(row)).toBe(false)
  })

  it('returns false when scraper row has explicit unit signals', () => {
    const row = makeRow({ source: 'scraper', raw_unit: 'oz' })
    expect(shouldUsePackagedUnitFallback(row)).toBe(false)
  })

  it('returns true for scraper row with no unit signals', () => {
    const row = makeRow({ source: 'scraper', cleaned_name: 'olive oil', raw_product_name: 'kirkland olive oil' })
    expect(shouldUsePackagedUnitFallback(row)).toBe(true)
  })
})

describe('shouldUsePackagedUnitFallbackAfterFailure', () => {
  it('returns false when source is not scraper', () => {
    const row = makeRow({ source: 'recipe', cleaned_name: 'olive oil' })
    expect(shouldUsePackagedUnitFallbackAfterFailure(row)).toBe(false)
  })

  it('returns false when unit result succeeded', () => {
    const row = makeRow({ source: 'scraper', cleaned_name: 'olive oil' })
    expect(shouldUsePackagedUnitFallbackAfterFailure(row, { id: '1', status: 'success', resolvedUnit: 'oz', resolvedQuantity: 1, confidence: 0.9 })).toBe(false)
  })

  it('returns true when scraper and no unit signals and unit failed', () => {
    const row = makeRow({ source: 'scraper', cleaned_name: 'olive oil', raw_product_name: 'kirkland olive oil' })
    expect(shouldUsePackagedUnitFallbackAfterFailure(row, { id: '1', status: 'failed' })).toBe(true)
  })

  it('returns true for scraper with packaged item signals even when unit signals absent after failure', () => {
    const row = makeRow({ source: 'scraper', cleaned_name: 'pasta box', raw_product_name: 'barilla pasta' })
    expect(shouldUsePackagedUnitFallbackAfterFailure(row, { id: '1', status: 'failed' })).toBe(true)
  })
})

describe('buildPackagedUnitFallback', () => {
  it('returns a success result with unit=unit, quantity=1, and fallback confidence', () => {
    const result = buildPackagedUnitFallback('row-123')
    expect(result).toEqual({
      id: 'row-123',
      resolvedUnit: 'unit',
      resolvedQuantity: 1,
      confidence: UNIT_FALLBACK_CONFIDENCE,
      status: 'success',
    })
  })
})

describe('isPackagedUnitFallbackResult', () => {
  const row = makeRow()

  it('returns false when unitResult is undefined', () => {
    expect(isPackagedUnitFallbackResult(row, undefined)).toBe(false)
  })

  it('returns false when status is not success', () => {
    expect(isPackagedUnitFallbackResult(row, { id: '1', status: 'failed' })).toBe(false)
  })

  it('returns false when resolvedUnit is not "unit"', () => {
    expect(isPackagedUnitFallbackResult(row, { id: '1', status: 'success', resolvedUnit: 'oz', resolvedQuantity: 1, confidence: UNIT_FALLBACK_CONFIDENCE })).toBe(false)
  })

  it('returns false when resolvedQuantity is not 1', () => {
    expect(isPackagedUnitFallbackResult(row, { id: '1', status: 'success', resolvedUnit: 'unit', resolvedQuantity: 2, confidence: UNIT_FALLBACK_CONFIDENCE })).toBe(false)
  })

  it('returns false when confidence is above fallback threshold', () => {
    expect(isPackagedUnitFallbackResult(row, { id: '1', status: 'success', resolvedUnit: 'unit', resolvedQuantity: 1, confidence: UNIT_FALLBACK_CONFIDENCE + 0.01 })).toBe(false)
  })

  it('returns true for an exact packaged unit fallback result', () => {
    const result = buildPackagedUnitFallback('row-1')
    expect(isPackagedUnitFallbackResult(row, result)).toBe(true)
  })
})

describe('collectUnitHints', () => {
  it('includes raw_unit from row', () => {
    const row = makeRow({ raw_unit: 'fl oz' })
    const hints = collectUnitHints(row)
    expect(hints).toContain('fl oz')
  })

  it('includes resolved_unit from row', () => {
    const row = makeRow({ resolved_unit: 'lb' })
    const hints = collectUnitHints(row)
    expect(hints).toContain('lb')
  })

  it('includes all aliases for a successful unit result', () => {
    const row = makeRow()
    const hints = collectUnitHints(row, { id: '1', status: 'success', resolvedUnit: 'oz', resolvedQuantity: 1, confidence: 0.9 })
    expect(hints).toContain('oz')
    expect(hints).toContain('ounce')
    expect(hints).toContain('ounces')
  })

  it('always includes generic measure aliases', () => {
    const row = makeRow()
    const hints = collectUnitHints(row)
    expect(hints).toContain('cup')
    expect(hints).toContain('tbsp')
    expect(hints).toContain('tsp')
  })

  it('filters out hints longer than 3 tokens', () => {
    // raw_unit with 4+ tokens should be excluded
    const row = makeRow({ raw_unit: 'one two three four tokens' })
    const hints = collectUnitHints(row)
    expect(hints).not.toContain('one two three four tokens')
  })

  it('sorts hints longest-first', () => {
    const row = makeRow()
    const hints = collectUnitHints(row)
    for (let i = 1; i < hints.length; i++) {
      expect(hints[i - 1].length).toBeGreaterThanOrEqual(hints[i].length)
    }
  })
})

describe('stripMeasurementFromSearchTerm', () => {
  const row = makeRow()

  it('strips leading quantity and unit', () => {
    const unitResult = { id: '1', status: 'success' as const, resolvedUnit: 'cup', resolvedQuantity: 2, confidence: 0.9 }
    const result = stripMeasurementFromSearchTerm('2 cups flour', row, unitResult)
    expect(result).toBe('flour')
  })

  it('strips leading quantity-only', () => {
    const result = stripMeasurementFromSearchTerm('3 chicken breasts', row)
    expect(result).toBe('chicken breasts')
  })

  it('strips trailing quantity', () => {
    const result = stripMeasurementFromSearchTerm('chicken breasts 3', row)
    expect(result).toBe('chicken breasts')
  })

  it('returns original when result would be empty', () => {
    const result = stripMeasurementFromSearchTerm('2', row)
    expect(result).toBe('2')
  })

  it('handles fractional quantities', () => {
    const unitResult = { id: '1', status: 'success' as const, resolvedUnit: 'cup', resolvedQuantity: 0.5, confidence: 0.9 }
    const result = stripMeasurementFromSearchTerm('1/2 cup sugar', row, unitResult)
    expect(result).toBe('sugar')
  })

  it('does not strip from middle of term', () => {
    const result = stripMeasurementFromSearchTerm('chicken 2 lbs breast', row)
    // Leading/trailing patterns only — middle measurements stay
    expect(result).toContain('chicken')
  })
})
