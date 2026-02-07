import { type Database } from "./database/supabase"
import { standardizedIngredientsDB } from "./database/standardized-ingredients-db"
import { ingredientsHistoryDB, ingredientsRecentDB, normalizeStoreName } from "./database/ingredients-db"
import { normalizeZipCode } from "./utils/zip"
import type { StoreMetadata, StoreMetadataMap } from "./utils/store-metadata"

type DB = Database["public"]["Tables"]
type IngredientRecentRow = DB["ingredients_recent"]["Row"]
type IngredientHistoryRow = DB["ingredients_history"]["Row"]
type StandardizedIngredientRow = DB["standardized_ingredients"]["Row"]

export type IngredientCacheResult = IngredientRecentRow & {
  product_id?: string | null
  location?: string | null
  standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
  product_url?: string | null
  from_cache?: boolean
}

export interface PricedIngredient {
  standardizedIngredientId: string
  name: string
  cache: IngredientCacheResult | null
}

// Re-export store metadata types from utility module for backward compatibility
export type {
  StoreMetadata,
  StoreMetadataMap
} from "@/lib/utils/store-metadata"

const MEASUREMENT_TERMS = [
  "cup",
  "cups",
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "pound",
  "pounds",
  "lb",
  "lbs",
  "ounce",
  "ounces",
  "oz",
  "gram",
  "grams",
  "g",
  "kg",
  "kilogram",
  "kilograms",
  "ml",
  "milliliter",
  "milliliters",
  "liter",
  "liters",
  "l",
  "pinch",
  "clove",
  "cloves",
  "slice",
  "slices",
  "stick",
  "sticks",
]

const STOP_WORDS = new Set([
  "fresh",
  "large",
  "small",
  "boneless",
  "skinless",
  "ripe",
  "optional",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "ground",
  "crushed",
  "grated",
  "shredded",
  "cooked",
  "uncooked",
  "raw",
  "whole",
  "dried",
  "toasted",
  "packed",
  "divided",
])

function normalizeIngredientName(raw: string): string {
  const lower = raw.toLowerCase().trim()
  if (!lower) return ""

  const withoutParens = lower.replace(/\(.*?\)/g, " ")
  const withoutFractions = withoutParens.replace(/[\d/.-]+/g, " ")
  const withoutUnits = MEASUREMENT_TERMS.reduce(
    (acc, term) => acc.replace(new RegExp(`\\b${term}\\b`, "g"), " "),
    withoutFractions
  )
  const tokens = withoutUnits
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))

  return tokens.join(" ").trim()
}

async function findStandardizedIngredientViaMapping(
  originalName: string
): Promise<string | null> {
  const cleanName = originalName.trim();

  const exactMatch = await standardizedIngredientsDB.findByCanonicalName(cleanName);
  if (exactMatch) return exactMatch.id;

  const searchResults = await standardizedIngredientsDB.searchByText(cleanName, {
    limit: 1
  });

  return searchResults.length > 0 ? searchResults[0].id : null;
}

async function findStandardizedIngredient(
  normalizedName: string,
  fallbackName?: string
): Promise<StandardizedIngredientRow | null> {
  const searchValue = normalizedName || fallbackName?.toLowerCase().trim() || ""
  if (!searchValue) return null

  const exact = await standardizedIngredientsDB.findByCanonicalName(searchValue)
  if (exact) return exact

  const fuzzyResults = await standardizedIngredientsDB.searchByText(searchValue, {
    limit: 1
  })

  return fuzzyResults[0] || null
}

export async function findExistingStandardizedId(
  query: string
): Promise<string | null> {
  if (!query) return null
  const trimmed = query.trim()
  if (!trimmed) return null

  const mappedId = await findStandardizedIngredientViaMapping(trimmed)
  if (mappedId) return mappedId

  const normalized = normalizeIngredientName(trimmed)
  const existing = await findStandardizedIngredient(normalized, trimmed)
  return existing?.id || null
}

async function loadCanonicalName(
  standardizedIngredientId: string
): Promise<string | null> {
  // Use fetchByIds (which returns an array) or add a fetchById to your class
  const ingredients = await standardizedIngredientsDB.fetchByIds([standardizedIngredientId]);
  
  const ingredient = ingredients[0];
  
  if (!ingredient) {
    console.warn(`[ingredient-pipeline] No ingredient found for ID: ${standardizedIngredientId}`);
    return null;
  }

  return ingredient.canonical_name.toLowerCase();
}

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

  /** Product page URL */
  product_url?: string | null

  /** Store's internal product ID */
  product_id?: string | null

  /** @deprecated Legacy field - use product_name instead */
  title?: string
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
 * Modernized cache entry handler.
 * Now leverages IngredientCacheTable for automatic TTL and normalization.
 */
async function upsertCacheEntry(
  standardizedIngredientId: string,
  store: string,
  product: ScraperResult,
  zipCode?: string | null,
  storeMeta?: StoreMetadata
): Promise<IngredientCacheResult | null> {

  const normalizedStore = normalizeStoreName(store)

  const historyRow = await ingredientsHistoryDB.insertPrice({
    standardizedIngredientId,
    store: normalizedStore,
    price: Number(product.price) || 0,
    imageUrl: product.image_url ?? null,
    productName: product.product_name ?? product.title ?? null,
    productId: product.product_id ? String(product.product_id) : null,
    location: null, // Deprecated - zipCode is used instead
    zipCode: zipCode ?? null,
    groceryStoreId: storeMeta?.storeId ?? storeMeta?.grocery_store_id ?? null,
  })

  if (!historyRow) {
    console.error(`[ingredient-pipeline] Failed to record price history for ${store}`)
    return null
  }

  const recents = await ingredientsRecentDB.findByStandardizedId(
    standardizedIngredientId,
    [normalizedStore],
    zipCode
  )

  return recents[0] || { ...historyRow, product_id: historyRow.product_id ?? null, location: historyRow.location ?? null }
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

    const storeMeta = normalizedOptions.storeMetadata?.get(store)
    const resolvedStoreId = storeMeta?.storeId ?? storeMeta?.grocery_store_id ?? null
    const storeZip = storeMeta?.zipCode ?? normalizedOptions.zipCode

    // Return the specific payload format for batchInsertPricesRpc
    // Note: standardizedIngredientId is matched by the database based on productName
    return {
      store,
      price: Number(bestProduct.price) || 0,
      imageUrl: bestProduct.image_url,
      productName: bestProduct.product_name || bestProduct.title,
      productId: bestProduct.product_id ? String(bestProduct.product_id) : null,
      zipCode: storeZip,
      groceryStoreId: storeMeta?.grocery_store_id ?? resolvedStoreId,
    }
  })

  const validPayloads = (await Promise.all(scrapePromises)).filter((p): p is any => p !== null)

  // 5. Batch insert into history via RPC; triggers sync recents
  if (validPayloads.length > 0) {
    let count = await ingredientsHistoryDB.batchInsertPricesRpc(validPayloads)

    // Fallback to standard insert if RPC is unavailable
    if (count === 0) {
      count = await ingredientsHistoryDB.batchInsertPrices(validPayloads)
    }
    
    if (count > 0) {
      // Refresh results from recents to ensure we have the latest rows
      const freshScrapedData = await ingredientsRecentDB.findByStandardizedId(
        standardizedIngredientId,
        validPayloads.map(p => p.store),
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

export async function getOrRefreshIngredientPrice(
  standardizedIngredientId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult | null> {
  if (!standardizedIngredientId) throw new Error("standardizedIngredientId is required")
  if (!store) throw new Error("store is required")

  // Normalize store name for cache lookup (handle both "target" and "Target", "99 Ranch" and "99ranch")
  const normalizedStore = normalizeStoreName(store)
  const storeMetadata = options.storeMetadata?.get(normalizedStore)

  const startTime = Date.now()
  console.log("[ingredient-pipeline] getOrRefreshIngredientPrice called", {
    standardizedIngredientId,
    store,
    normalizedStore,
    zipCode: options.zipCode,
  })

  const forceRefresh = options.forceRefresh === true

  // Use the recents materialized table to check for cached result
  const cachedItems = await ingredientsRecentDB.findByStandardizedId(
    standardizedIngredientId,
    [normalizedStore],
    options.zipCode
  )
  const cached = cachedItems[0] || null

  // Check if cache exists and is still valid
  if (cached && !forceRefresh) {
    console.log("[ingredient-pipeline] Cache HIT", {
      store: normalizedStore,
      product_name: cached.product_name,
      price: cached.price,
      timeMs: Date.now() - startTime,
    })
    return cached
  } else {
    console.log("[ingredient-pipeline] Cache MISS (not found), will scrape", {
      store: normalizedStore,
      standardizedIngredientId,
      timeMs: Date.now() - startTime,
    })
  }

  // If real-time scraping is disabled, return null for missing/expired cache
  if (options.allowRealTimeScraping === false) {
    console.log("[ingredient-pipeline] Real-time scraping disabled, returning cached value if present", {
      store: normalizedStore,
      standardizedIngredientId,
    })
    return cached
  }

  const canonicalName = await loadCanonicalName(standardizedIngredientId)
  if (!canonicalName) {
    console.warn("[ingredient-pipeline] Missing canonical name for standardized ingredient", { standardizedIngredientId })
    return null
  }

  const scrapeStart = Date.now()
  const scraped = await runStoreScraper(store, canonicalName, options)
  const scrapeTime = Date.now() - scrapeStart
  console.log("[ingredient-pipeline] Scraper raw results", {
    store: normalizedStore,
    canonicalName,
    resultsCount: scraped?.length || 0,
    hasResults: scraped && scraped.length > 0,
    scrapeTimeMs: scrapeTime,
  })

  const bestProduct = pickBestScrapedProduct(scraped)
  if (!bestProduct) {
    console.warn("[ingredient-pipeline] Scraper returned no usable products", {
      store,
      canonicalName,
      rawResultsCount: scraped?.length || 0,
      reason: scraped?.length === 0 ? "Empty array returned" : "No valid products in results"
    })
    return null
  }

  console.log("[ingredient-pipeline] Best product selected", {
    store: normalizedStore,
    productName: bestProduct.product_name || bestProduct.title,
    price: bestProduct.price
  })

  const upsertStart = Date.now()
  const result = await upsertCacheEntry(standardizedIngredientId, store, bestProduct, options.zipCode, storeMetadata)
  const totalTime = Date.now() - startTime

  console.log("[ingredient-pipeline] getOrRefreshIngredientPrice completed", {
    store: normalizedStore,
    success: !!result,
    upsertTimeMs: Date.now() - upsertStart,
    totalTimeMs: totalTime,
  })

  return result || cached
}

/**
 * Pipeline Ingredient Input Type
 *
 * Ingredient input specific to the ingredient pricing pipeline.
 * Pipeline-specific type kept separate from general ingredient types
 * to avoid conflicts with form-level IngredientFormInput.
 *
 * @see IngredientFormInput in lib/types/forms/ingredient.ts - Form input type
 */
export interface PipelineIngredientInput {
  name: string
  quantity?: number
  recipeId?: string | null
  standardizedIngredientId?: string | null
}

/**
 * @deprecated Use PipelineIngredientInput instead
 * This alias is maintained for backward compatibility during migration.
 */
export type IngredientInput = PipelineIngredientInput
