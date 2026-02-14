/**
 * Standardized scraper result type
 * All scrapers should return data in this format
 *
 * Note: Scrapers only return raw product data from the store website.
 * Context like zipCode comes from the database, not from scrapers.
 */
export interface ScraperResult {
  /** Product name as it appears on the store website */
  product_name: string

  /** Product price */
  price: number

  /** Product image URL */
  image_url?: string | null

  /** Store's internal product ID */
  product_id?: string | null
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function hasEmbeddedUnitToken(value: string): boolean {
  const text = normalizeWhitespace(value).toLowerCase()
  if (!text) return false

  return (
    /\b\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|lb|lbs?|pounds?|grams?|g|kg|ml|l|gal|gallon|gallons|ct|count|pk|pack|ea|each|bunch)\b/i.test(
      text
    ) || /\b(?:each|ea|ct|count|pack|pk|bunch)\b/i.test(text)
  )
}

function extractUnitHint(result: any): string {
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

  const pricePerUnit = normalizeWhitespace(result?.pricePerUnit || result?.price_per_unit || "")
  if (!pricePerUnit) return ""
  const suffixMatch = pricePerUnit.match(/\/\s*([a-z][a-z.\s]{0,20})$/i)
  return suffixMatch ? normalizeWhitespace(suffixMatch[1]).toLowerCase() : ""
}

function buildProductNameWithUnit(result: any): string {
  const baseName = normalizeWhitespace(result?.product_name || result?.title || result?.name || "")
  if (!baseName) return ""
  if (hasEmbeddedUnitToken(baseName)) return baseName

  const unitHint = extractUnitHint(result)
  if (!unitHint) return baseName
  if (baseName.toLowerCase().includes(unitHint.toLowerCase())) return baseName
  return `${baseName} ${unitHint}`.trim()
}

/**
 * Normalize legacy scraper results that may use 'title' instead of 'product_name'
 */
export function normalizeScraperResult(result: any): ScraperResult {
  return {
    product_name: buildProductNameWithUnit(result),
    price: Number(result.price) || 0,
    image_url: result.image_url ?? null,
    product_id: result.product_id ?? (result.id != null ? String(result.id) : null),
  }
}

/**
 * Normalize an array of scraper results
 */
export function normalizeScraperResults(results: any[]): ScraperResult[] {
  if (!Array.isArray(results)) return []
  return results
    .map(normalizeScraperResult)
    .filter(r => r.product_name && r.price > 0)
}
