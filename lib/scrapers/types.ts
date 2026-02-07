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

/**
 * Normalize legacy scraper results that may use 'title' instead of 'product_name'
 */
export function normalizeScraperResult(result: any): ScraperResult {
  return {
    product_name: result.product_name || result.title || "",
    price: Number(result.price) || 0,
    image_url: result.image_url ?? null,
    product_id: result.product_id ?? null,
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
