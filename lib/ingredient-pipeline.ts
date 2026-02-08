import { type Database } from "./database/supabase"
import { standardizedIngredientsDB } from "./database/standardized-ingredients-db"
import { ingredientsHistoryDB, ingredientsRecentDB, normalizeStoreName } from "./database/ingredients-db"
import { normalizeZipCode } from "./utils/zip"
import type { StoreMetadataMap } from "./utils/store-metadata"

type DB = Database["public"]["Tables"]
type IngredientRecentRow = DB["ingredients_recent"]["Row"]

export type IngredientCacheResult = IngredientRecentRow & {
  product_id?: string | null
  location?: string | null
  standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
  from_cache?: boolean
}

// Re-export store metadata types from utility module for backward compatibility
export type {
  StoreMetadata,
  StoreMetadataMap
} from "@/lib/utils/store-metadata"

/**
 * Raw scraper result format
 * Scrapers return product data without context like zipCode (comes from database)
 */
type ScraperResult = {
  /** Primary product name - all scrapers should use this field */
  product_name?: string

  /** Product price */
  price: number

  /** Product image URL */
  image_url?: string | null

  /** Store's internal product ID */
  product_id?: string | null

  /** @deprecated Legacy field - use product_id instead */
  id?: string | number | null

  /** @deprecated Legacy field - use product_name instead */
  title?: string
}

function getScraperProductName(product: ScraperResult): string | null {
  const value = product.product_name ?? product.title ?? null
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getScraperProductId(product: ScraperResult): string | null {
  const value = product.product_id ?? product.id ?? null
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

type StoreLookupOptions = {
  zipCode?: string | null
  forceRefresh?: boolean
  allowRealTimeScraping?: boolean // If false, only return cached results
  storeMetadata?: StoreMetadataMap
}

async function runStoreScraper(
  store: string,
  canonicalName: string,
  options: StoreLookupOptions = {}
): Promise<ScraperResult[]> {
  const normalizedStore = normalizeStoreName(store);
  const storeMeta = options.storeMetadata?.get(normalizedStore);
  const zip = normalizeZipCode(storeMeta?.zipCode ?? options.zipCode);

  try {
    console.log("[ingredient-pipeline] Running scraper", { store: normalizedStore, canonicalName, zip });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scrapers = require("./scrapers");

    type ScraperFunction = (query: string, zip?: string | null) => Promise<ScraperResult[] | any>;

    const scraperMap: Record<string, ScraperFunction> = {
      walmart: scrapers.searchWalmartAPI,
      safeway: scrapers.searchSafeway,
      andronicos: scrapers.searchAndronicos,
      traderjoes: scrapers.searchTraderJoes,
      wholefoods: scrapers.searchWholeFoods,
      whole_foods: scrapers.searchWholeFoods,
      aldi: scrapers.searchAldi,
      kroger: (query, zipCode) => scrapers.Krogers(zipCode, query),
      meijer: (query, zipCode) => scrapers.Meijers(zipCode, query),
      target: (query, zipCode) => scrapers.getTargetProducts(query, null, zipCode),
      ranch99: scrapers.search99Ranch,
      "99ranch": scrapers.search99Ranch,
    };

    const scraper = scraperMap[normalizedStore];
    if (!scraper) {
      console.warn(`[ingredient-pipeline] No scraper configured for store ${store}`);
      return [];
    }

    const results = await scraper(canonicalName, zip);

    if (!results) {
      console.warn("[ingredient-pipeline] Scraper returned no results", { store: normalizedStore, canonicalName, zip });
      return [];
    }
    if (Array.isArray(results)) {
      console.log("[ingredient-pipeline] Scraper results", { store: normalizedStore, count: results.length });
      return results;
    }
    if (results?.items && Array.isArray(results.items)) {
      console.log("[ingredient-pipeline] Scraper results (items field)", { store: normalizedStore, count: results.items.length });
      return results.items;
    }
    console.warn("[ingredient-pipeline] Scraper results not in expected format", { store: normalizedStore, canonicalName, zip });
    return [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[ingredient-pipeline] Scraper failed for ${store}`, {
      store,
      canonicalName,
      zip,
      errorMessage,
      errorStack: errorStack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    });
    return [];
  }
}

function pickBestScrapedProduct(items: ScraperResult[]): ScraperResult | null {
  if (!items || items.length === 0) return null

  // Sort by price (lowest first)
  const sorted = [...items].sort((a, b) => {
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)
  })

  return sorted[0] || null
}

/**
 * Batch get or refresh ingredient prices for multiple stores at once.
 * Leverages the Singleton DB classes for caching and batching logic.
 */
export async function getOrRefreshIngredientPricesForStores(
  standardizedIngredientId: string,
  stores: string[],
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult[]> {
  if (!standardizedIngredientId) throw new Error("standardizedIngredientId is required")
  if (!stores || stores.length === 0) return []

  // Normalize zipCode at entry point
  const normalizedOptions = {
    ...options,
    zipCode: normalizeZipCode(options.zipCode) ?? options.zipCode
  }

  const startTime = Date.now()
  const forceRefresh = normalizedOptions.forceRefresh === true

  // 1. Single batched query for all stores using the recents materialized table
  const cachedItems = await ingredientsRecentDB.findByStandardizedId(
    standardizedIngredientId,
    stores,
    normalizedOptions.zipCode
  )

  // Map cached items for quick lookup
  const cachedByStore = new Map(cachedItems.map(item => [normalizeStoreName(item.store), item]))

  // Identify missing stores (Note: findByStandardizedId handles normalization of the 'stores' input)
  const normalizedRequestedStores = stores.map(normalizeStoreName)
  const storesToScrape = forceRefresh
    ? normalizedRequestedStores
    : normalizedRequestedStores.filter(store => !cachedByStore.has(store))

  const results: IngredientCacheResult[] = forceRefresh ? [] : [...cachedItems]

  // 2. Early exit if scraping is disabled
  if (normalizedOptions.allowRealTimeScraping === false) {
    return cachedItems
  }

  // 3. Early exit if no scraping is needed
  if (storesToScrape.length === 0) {
    return results
  }

  // 3. Load canonical name using the standardizedIngredientsDB instance
  const ingredients = await standardizedIngredientsDB.fetchByIds([standardizedIngredientId])
  const canonicalName = ingredients[0]?.canonical_name

  if (!canonicalName) {
    console.warn("[ingredient-pipeline] Missing canonical name", { standardizedIngredientId })
    return results
  }

  // 4. Scrape missing stores in parallel
  const scrapePromises = storesToScrape.map(async (store) => {
    const scraped = await runStoreScraper(store, canonicalName, normalizedOptions)
    const bestProduct = pickBestScrapedProduct(scraped)

    if (!bestProduct) return null
    const productName = getScraperProductName(bestProduct)
    if (!productName) return null

    const storeMeta = normalizedOptions.storeMetadata?.get(store)
    const resolvedStoreId = storeMeta?.storeId ?? storeMeta?.grocery_store_id ?? null
    const storeZip = storeMeta?.zipCode ?? normalizedOptions.zipCode

    // Return RPC payload shape for fn_bulk_insert_ingredient_history.
    return {
      store,
      price: Number(bestProduct.price) || 0,
      imageUrl: bestProduct.image_url,
      productName,
      productId: getScraperProductId(bestProduct),
      zipCode: storeZip,
      groceryStoreId: storeMeta?.grocery_store_id ?? resolvedStoreId,
    }
  })

  const rpcPayloads = (await Promise.all(scrapePromises)).filter(
    (p): p is NonNullable<typeof p> => p !== null
  )

  // 5. Batch insert into history via RPC; triggers sync recents
  if (rpcPayloads.length > 0) {
    let count = await ingredientsHistoryDB.batchInsertPricesRpc(rpcPayloads)

    // Fallback to standard insert if RPC is unavailable
    if (count === 0) {
      const fallbackPayloads = rpcPayloads.map((item) => ({
        standardizedIngredientId,
        ...item,
      }))
      count = await ingredientsHistoryDB.batchInsertPrices(fallbackPayloads)
    }
    
    if (count > 0) {
      // Refresh results from recents to ensure we have the latest rows
      const freshScrapedData = await ingredientsRecentDB.findByStandardizedId(
        standardizedIngredientId,
        rpcPayloads.map(p => p.store),
        normalizedOptions.zipCode
      )
      freshScrapedData.forEach((row) => {
        cachedByStore.set(normalizeStoreName(row.store), row)
      })
      results.splice(0, results.length, ...Array.from(cachedByStore.values()))
    }
  }

  const finalResults = results.length > 0 ? results : cachedItems

  console.log("[ingredient-pipeline] completed", {
    totalResults: finalResults.length,
    totalTimeMs: Date.now() - startTime
  })

  return finalResults
}
