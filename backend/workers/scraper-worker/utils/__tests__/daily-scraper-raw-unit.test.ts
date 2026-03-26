import { describe, it, expect } from 'vitest'
import {
  extractUnitHintFromDailyScraper,
  resolveRawUnitWithDailyScraperPriority,
} from '../daily-scraper-raw-unit'

describe('extractUnitHintFromDailyScraper', () => {
  it('returns the unit field when present', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'lb' })).toBe('lb')
  })

  it('normalizes whitespace in the unit field', () => {
    expect(extractUnitHintFromDailyScraper({ unit: '  fl  oz  ' })).toBe('fl oz')
  })

  it('falls back to size when unit is absent', () => {
    expect(extractUnitHintFromDailyScraper({ size: '12 oz' })).toBe('12 oz')
  })

  it('falls back to package_size when unit and size are absent', () => {
    expect(extractUnitHintFromDailyScraper({ package_size: '6-pack' })).toBe('6-pack')
  })

  it('falls back to unit_size when prior fields are absent', () => {
    expect(extractUnitHintFromDailyScraper({ unit_size: '500ml' })).toBe('500ml')
  })

  it('skips empty string candidates', () => {
    expect(extractUnitHintFromDailyScraper({ unit: '', size: '8 fl oz' })).toBe('8 fl oz')
  })

  it('skips null/undefined candidates', () => {
    expect(extractUnitHintFromDailyScraper({ unit: null, size: undefined, package_size: 'bag' })).toBe('bag')
  })

  it('skips "n/a" as an empty unit', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'n/a', size: '1 lb' })).toBe('1 lb')
  })

  it('skips "NA" (case-insensitive)', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'NA', size: '1 lb' })).toBe('1 lb')
  })

  it('skips "none" as an empty unit', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'none', size: '2 oz' })).toBe('2 oz')
  })

  it('skips "null" string as an empty unit', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'null', size: '2 oz' })).toBe('2 oz')
  })

  it('skips "undefined" string as an empty unit', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'undefined', size: '2 oz' })).toBe('2 oz')
  })

  it('extracts unit from pricePerUnit suffix', () => {
    expect(extractUnitHintFromDailyScraper({ pricePerUnit: '$1.50/lb' })).toBe('lb')
  })

  it('extracts unit from price_per_unit suffix (snake_case)', () => {
    expect(extractUnitHintFromDailyScraper({ price_per_unit: '$2.00/oz' })).toBe('oz')
  })

  it('normalizes extracted pricePerUnit suffix to lowercase', () => {
    expect(extractUnitHintFromDailyScraper({ pricePerUnit: '$1.00/LB' })).toBe('lb')
  })

  it('handles whitespace around pricePerUnit suffix slash', () => {
    expect(extractUnitHintFromDailyScraper({ pricePerUnit: '$1.50 / fl oz' })).toBe('fl oz')
  })

  it('returns empty string when no candidates are found', () => {
    expect(extractUnitHintFromDailyScraper({})).toBe('')
  })

  it('returns empty string when all candidates are empty/invalid', () => {
    expect(extractUnitHintFromDailyScraper({ unit: '', size: 'none', package_size: null })).toBe('')
  })

  it('prefers direct candidates over pricePerUnit', () => {
    expect(extractUnitHintFromDailyScraper({ unit: 'lb', pricePerUnit: '$1/oz' })).toBe('lb')
  })
})

describe('resolveRawUnitWithDailyScraperPriority', () => {
  it('returns rawUnit when explicitly set', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ rawUnit: 'kg', unit: 'lb' })).toBe('kg')
  })

  it('returns raw_unit (snake_case) when rawUnit is absent', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ raw_unit: 'oz', unit: 'lb' })).toBe('oz')
  })

  it('normalizes whitespace in rawUnit', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ rawUnit: '  fl  oz  ' })).toBe('fl oz')
  })

  it('skips rawUnit when it is an empty-unit value like "n/a"', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ rawUnit: 'n/a', unit: 'lb' })).toBe('lb')
  })

  it('falls back to extractUnitHintFromDailyScraper when rawUnit is absent', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ unit: '500ml' })).toBe('500ml')
  })

  it('returns null when neither rawUnit nor any hint is available', () => {
    expect(resolveRawUnitWithDailyScraperPriority({})).toBeNull()
  })

  it('returns null when all sources are empty/invalid', () => {
    expect(resolveRawUnitWithDailyScraperPriority({ rawUnit: '', unit: 'none' })).toBeNull()
  })

  it('prefers rawUnit over all other fields', () => {
    expect(
      resolveRawUnitWithDailyScraperPriority({
        rawUnit: 'each',
        raw_unit: 'bag',
        unit: 'lb',
        size: 'oz',
        pricePerUnit: '$1/fl oz',
      })
    ).toBe('each')
  })
})
