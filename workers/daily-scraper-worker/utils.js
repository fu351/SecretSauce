export function getIntEnv(name, fallback, minValue = 0) {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  if (Number.isFinite(parsed) && parsed >= minValue) {
    return parsed
  }
  return fallback
}

export function getBooleanEnv(name, fallback = false) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }

  const normalized = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function normalizeStoreEnum(storeValue) {
  return String(storeValue || '').trim().toLowerCase()
}

export function normalizeZipCode(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^\d{5}/)
  return match ? match[0] : ''
}

export function parseCitiesCsv(value) {
  if (!value) return []
  const seen = new Set()
  const cities = []
  for (const entry of String(value).split(',')) {
    const city = entry.trim()
    if (!city) continue
    if (seen.has(city)) continue
    seen.add(city)
    cities.push(city)
  }
  return cities
}

export function normalizeStateCode(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : ''
}

export function buildStoreFilterContext({
  storeState = null,
  storeCity = null,
  storeCitiesCsv = null,
  storeZipMin = null,
  storeZipMax = null,
} = {}) {
  return {
    stateCode: normalizeStateCode(storeState),
    city: storeCity || null,
    cities: parseCitiesCsv(storeCitiesCsv),
    zipMin: storeZipMin || null,
    zipMax: storeZipMax || null,
  }
}

export function hasStoreRangeFilters(filterContext) {
  return Boolean(
    filterContext?.stateCode ||
    filterContext?.city ||
    (Array.isArray(filterContext?.cities) && filterContext.cities.length > 0) ||
    filterContext?.zipMin ||
    filterContext?.zipMax
  )
}

export function formatStoreFilterSummary(filterContext) {
  const stateLabel = filterContext?.stateCode || 'ALL'
  const cityLabel = Array.isArray(filterContext?.cities) && filterContext.cities.length > 0
    ? filterContext.cities.join(', ')
    : (filterContext?.city || 'ALL')
  const zipMinLabel = filterContext?.zipMin || 'NONE'
  const zipMaxLabel = filterContext?.zipMax || 'NONE'

  return `state=${stateLabel}, cities=${cityLabel}, zip_min=${zipMinLabel}, zip_max=${zipMaxLabel}`
}

export function applyStoreRangeFilters(query, filterContext) {
  let scopedQuery = query

  if (filterContext?.zipMin) {
    scopedQuery = scopedQuery.gte('zip_code', filterContext.zipMin)
  }

  if (filterContext?.zipMax) {
    scopedQuery = scopedQuery.lte('zip_code', filterContext.zipMax)
  }

  if (filterContext?.stateCode) {
    scopedQuery = scopedQuery.eq('state', filterContext.stateCode)
  }

  if (Array.isArray(filterContext?.cities) && filterContext.cities.length > 0) {
    scopedQuery = scopedQuery.in('city', filterContext.cities)
  } else if (filterContext?.city) {
    scopedQuery = scopedQuery.eq('city', filterContext.city)
  }

  return scopedQuery
}

export function truncateText(value, maxLength = 320) {
  if (!value) return ''
  const normalized = String(value).trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

export function toPriceNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const stripped = value.replace(/[^0-9.-]/g, '')
    const parsed = Number.parseFloat(stripped)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function normalizeResultsShape(rawResults) {
  if (Array.isArray(rawResults)) {
    return rawResults
  }

  if (Array.isArray(rawResults?.items)) {
    return rawResults.items
  }

  return []
}

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function hasEmbeddedUnitToken(value) {
  const text = normalizeWhitespace(value).toLowerCase()
  if (!text) return false

  // Quantity + common unit labels, or standalone count-style units.
  return (
    /\b\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|lb|lbs?|pounds?|grams?|g|kg|ml|l|gal|gallon|gallons|ct|count|pk|pack|ea|each|bunch)\b/i.test(text) ||
    /\b(?:each|ea|ct|count|pack|pk|bunch)\b/i.test(text)
  )
}

function extractUnitHint(result) {
  const directCandidates = [
    result?.unit,
    result?.size,
    result?.package_size,
    result?.unit_size,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeWhitespace(candidate)
    if (!normalized) continue
    if (/^(?:n\/a|na|none|null|undefined)$/i.test(normalized)) continue
    return normalized
  }

  const pricePerUnit = normalizeWhitespace(result?.pricePerUnit || result?.price_per_unit || '')
  if (!pricePerUnit) return ''
  const suffixMatch = pricePerUnit.match(/\/\s*([a-z][a-z.\s]{0,20})$/i)
  return suffixMatch ? normalizeWhitespace(suffixMatch[1]).toLowerCase() : ''
}

export function getProductName(result, fallbackIngredient) {
  const baseName = normalizeWhitespace(
    result?.product_name ||
    result?.title ||
    result?.name ||
    result?.description ||
    fallbackIngredient ||
    null
  )

  if (!baseName) return null

  if (hasEmbeddedUnitToken(baseName)) {
    return baseName
  }

  const unitHint = extractUnitHint(result)
  if (!unitHint) {
    return baseName
  }

  const normalizedLower = baseName.toLowerCase()
  if (normalizedLower.includes(unitHint.toLowerCase())) {
    return baseName
  }

  return `${baseName} ${unitHint}`.trim()
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return []

  const limit = Math.max(1, Math.min(concurrency, items.length))
  const output = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1

      if (index >= items.length) {
        return
      }

      output[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: limit }, () => worker())
  await Promise.all(workers)
  return output
}

export function emptyBatchResults(size) {
  return Array.from({ length: size }, () => [])
}

export function normalizeBatchResultsShape(rawBatchResults, expectedLength) {
  if (!Array.isArray(rawBatchResults)) {
    return emptyBatchResults(expectedLength)
  }

  return Array.from({ length: expectedLength }, (_, index) => normalizeResultsShape(rawBatchResults[index]))
}

/**
 * Parses a remaining cooldown duration from a rate-limit error message.
 * Matches patterns like "cooldown active for 74746ms" or "for 90000ms".
 * Returns 0 if no duration is found.
 */
export function parseCooldownMsFromMessage(message) {
  const match = String(message || '').match(/for\s+(\d+)\s*ms/i)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Runs a batch scraper call; if a rate-limit error with a parseable cooldown
 * duration is thrown, sleeps for that duration (+ 2s buffer, max 120s) and
 * retries once. Returns a structured result regardless of outcome.
 *
 * @param {object} opts
 * @param {() => Promise<any>} opts.runBatch  - calls the native batch scraper
 * @param {string}  opts.storeEnum
 * @param {string}  opts.message              - error message from the initial failure
 * @param {string}  opts.code                 - error code from the initial failure
 * @param {number}  opts.ingredientCount
 * @param {(ms: number) => Promise<void>} opts.sleepFn
 */
export async function runBatchWithCooldownRetry({
  runBatch,
  storeEnum,
  message,
  code,
  ingredientCount,
  sleepFn,
}) {
  const cooldownRemainingMs = parseCooldownMsFromMessage(message)

  if (cooldownRemainingMs > 0) {
    const sleepMs = Math.min(cooldownRemainingMs + 2000, 120000)
    await sleepFn(sleepMs)
    try {
      const retryResults = await runBatch()
      return {
        resultsByIngredient: normalizeBatchResultsShape(retryResults, ingredientCount),
        errorFlags: Array.from({ length: ingredientCount }, () => false),
        errorMessages: Array.from({ length: ingredientCount }, () => ''),
        http404Flags: Array.from({ length: ingredientCount }, () => false),
        errorCodes: Array.from({ length: ingredientCount }, () => ''),
        _retrySucceeded: true,
      }
    } catch (_retryError) {
      // fall through to error return below
    }
  }

  return {
    resultsByIngredient: emptyBatchResults(ingredientCount),
    errorFlags: Array.from({ length: ingredientCount }, () => true),
    errorMessages: Array.from({ length: ingredientCount }, () => message),
    http404Flags: Array.from({ length: ingredientCount }, () => false),
    errorCodes: Array.from({ length: ingredientCount }, () => (code || '').toUpperCase()),
    _retrySucceeded: false,
  }
}
