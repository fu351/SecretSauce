import { SupabaseClient } from "@supabase/supabase-js"
import { createServerClient, type Database } from "./supabase"
import { standardizeIngredientsWithAI } from "./ingredient-standardizer"
import { normalizeStoreName } from "./ingredient-cache"

type DB = Database["public"]["Tables"]
type IngredientCacheRow = DB["ingredient_cache"]["Row"]
type IngredientMappingRow = DB["ingredient_mappings"]["Row"]
type StandardizedIngredientRow = DB["standardized_ingredients"]["Row"]

type SupabaseLike = SupabaseClient<Database>

export type IngredientCacheResult = Omit<IngredientCacheRow, "created_at"> & {
  created_at?: string
}

export interface PricedIngredient {
  standardizedIngredientId: string
  name: string
  cache: IngredientCacheResult | null
}

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

const CACHE_TTL_HOURS = 24

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
  client: SupabaseLike,
  originalName: string
): Promise<string | null> {
  // Check if this exact string was previously mapped (from any recipe)
  // This leverages historical mappings to improve cache hits
  const { data, error } = await client
    .from("ingredient_mappings")
    .select("standardized_ingredient_id")
    .eq("original_name", originalName.trim())
    .limit(1)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Mapping lookup failed", error)
  }

  return data?.standardized_ingredient_id || null
}

async function findStandardizedIngredient(
  client: SupabaseLike,
  normalizedName: string,
  fallbackName?: string
): Promise<StandardizedIngredientRow | null> {
  const searchValue = normalizedName || fallbackName?.toLowerCase().trim() || ""
  if (!searchValue) return null

  const exact = await client
    .from("standardized_ingredients")
    .select("id, canonical_name, category")
    .eq("canonical_name", searchValue)
    .maybeSingle()

  if (exact.data) return exact.data
  if (exact.error && exact.error.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Exact canonical lookup failed", exact.error)
  }

  // Improved fuzzy match: get multiple matches and rank by relevance
  const { data: fuzzyResults, error: fuzzyError } = await client
    .from("standardized_ingredients")
    .select("id, canonical_name, category")
    .ilike("canonical_name", `%${searchValue}%`)
    .limit(10)

  if (fuzzyError && fuzzyError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Fuzzy canonical lookup failed", fuzzyError)
    return null
  }

  if (!fuzzyResults || fuzzyResults.length === 0) {
    return null
  }

  // Rank by relevance: prefer shorter names (more specific) and exact substring matches
  const ranked = fuzzyResults
    .map(result => {
      const canonical = result.canonical_name.toLowerCase()
      const search = searchValue.toLowerCase()

      // Score: lower is better
      let score = canonical.length // Prefer shorter (more specific)

      // Boost exact matches
      if (canonical === search) score -= 1000

      // Boost starts-with matches
      if (canonical.startsWith(search)) score -= 100

      // Boost word boundary matches
      if (new RegExp(`\\b${search}\\b`).test(canonical)) score -= 50

      return { ...result, score }
    })
    .sort((a, b) => a.score - b.score)

  console.log("[ingredient-pipeline] Fuzzy match ranked results", {
    searchValue,
    topMatch: ranked[0]?.canonical_name,
    score: ranked[0]?.score,
    totalMatches: ranked.length
  })

  return ranked[0] || null
}

async function createStandardizedIngredient(
  client: SupabaseLike,
  canonicalName: string,
  category?: string | null
): Promise<string> {
  const safeName = canonicalName.trim().toLowerCase()
  const { data, error } = await client
    .from("standardized_ingredients")
    .upsert(
      { canonical_name: safeName, category: category ?? null },
      { onConflict: "canonical_name" }
    )
    .select("id")
    .maybeSingle()

  if (error || !data?.id) {
    throw new Error(`Unable to create standardized ingredient: ${error?.message || "unknown error"}`)
  }

  return data.id
}

async function ensureIngredientMapping(
  client: SupabaseLike,
  recipeId: string,
  originalName: string,
  standardizedIngredientId: string
): Promise<void> {
  try {
    const { data: existing, error: existingError } = await client
      .from("ingredient_mappings")
      .select("id")
      .eq("recipe_id", recipeId)
      .eq("original_name", originalName)
      .maybeSingle()

    if (existingError && existingError.code !== "PGRST116") {
      console.warn("[ingredient-pipeline] Failed to check existing mapping", existingError)
    }

    if (!existing?.id) {
      const { error } = await client.from("ingredient_mappings").insert({
        recipe_id: recipeId,
        original_name: originalName,
        standardized_ingredient_id: standardizedIngredientId,
      } satisfies DB["ingredient_mappings"]["Insert"])
      if (error) {
        console.warn("[ingredient-pipeline] Failed to insert mapping", error)
      }
    }
  } catch (error) {
    console.warn("[ingredient-pipeline] ensureIngredientMapping error", error)
  }
}

async function loadCanonicalName(
  client: SupabaseLike,
  standardizedIngredientId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("standardized_ingredients")
    .select("canonical_name")
    .eq("id", standardizedIngredientId)
    .maybeSingle()

  if (error) {
    console.error("[ingredient-pipeline] Failed to load canonical name", error)
    return null
  }

  return data?.canonical_name?.toLowerCase() || null
}

type ScraperResult = {
  title?: string
  product_name?: string
  price: number
  quantity?: number
  unit?: string
  unit_price?: number
  image_url?: string | null
  product_url?: string | null
  product_id?: string | null
  location?: string | null
}

type StoreLookupOptions = {
  zipCode?: string | null
  forceRefresh?: boolean
  allowRealTimeScraping?: boolean // If false, only return cached results
}

function normalizeZipInput(value?: string | null): string | undefined {
  if (!value) return undefined
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/)
  if (match) return match[0].slice(0, 5)
  const trimmed = value.trim()
  if (/^\d{5}$/.test(trimmed)) return trimmed
  return undefined
}

async function runStoreScraper(
  store: string,
  canonicalName: string,
  options: StoreLookupOptions = {},
): Promise<ScraperResult[]> {
  const normalizedStore = normalizeStoreName(store)
  const zip = normalizeZipInput(options.zipCode)
  try {
    console.log("[ingredient-pipeline] Running scraper", { store: normalizedStore, canonicalName, zip })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scrapers = require("./scrapers")

    const scraperMap: Record<string, ((query: string, zip?: string | null) => Promise<ScraperResult[] | any>) | undefined> =
      {
        walmart: scrapers.searchWalmartAPI,
        safeway: scrapers.searchSafeway,
        andronicos: scrapers.searchAndronicos,
        traderjoes: scrapers.searchTraderJoes,
        wholefoods: scrapers.searchWholeFoods,
        whole_foods: scrapers.searchWholeFoods,
        aldi: scrapers.searchAldi,
        kroger: scrapers.Krogers,
        meijer: scrapers.Meijers,
        target: scrapers.getTargetProducts,
        ranch99: scrapers.search99Ranch,
        "99ranch": scrapers.search99Ranch,
    }

    const scraper = scraperMap[normalizedStore]
    if (!scraper) {
      console.warn(`[ingredient-pipeline] No scraper configured for store ${store}`)
      return []
    }

    // Most scrapers expect (zip, query) or (query, zip); handle known signatures below.
    let results: any
    switch (normalizedStore) {
      case "kroger":
        results = await scraper(zip, canonicalName)
        break
      case "meijer":
        results = await scraper(zip, canonicalName)
        break
      case "target":
        results = await scraper(canonicalName, null, zip)
        break
      case "walmart":
        results = await scraper(canonicalName, zip)
        break
      case "traderjoes":
      case "wholefoods":
      case "whole_foods":
      case "aldi":
      case "safeway":
      case "andronicos":
      case "ranch99":
      case "99ranch":
        results = await scraper(canonicalName, zip)
        break
      default:
        results = await scraper(canonicalName, zip)
        break
    }

    if (!results) {
      console.warn("[ingredient-pipeline] Scraper returned no results", { store: normalizedStore, canonicalName, zip })
      return []
    }
    if (Array.isArray(results)) {
      console.log("[ingredient-pipeline] Scraper results", { store: normalizedStore, count: results.length })
      return results
    }
    if (results?.items && Array.isArray(results.items)) {
      console.log("[ingredient-pipeline] Scraper results (items field)", { store: normalizedStore, count: results.items.length })
      return results.items
    }
    console.warn("[ingredient-pipeline] Scraper results not in expected format", { store: normalizedStore, canonicalName, zip })
    return []
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error(`[ingredient-pipeline] Scraper failed for ${store}`, {
      store,
      canonicalName,
      zip,
      errorMessage,
      errorStack: errorStack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    })
    return []
  }
}

function pickBestScrapedProduct(items: ScraperResult[]): ScraperResult | null {
  if (!items || items.length === 0) return null

  const sorted = [...items].sort((a, b) => {
    const aUnit = Number.isFinite(a.unit_price) ? Number(a.unit_price) : Number.POSITIVE_INFINITY
    const bUnit = Number.isFinite(b.unit_price) ? Number(b.unit_price) : Number.POSITIVE_INFINITY
    if (aUnit !== bUnit) return aUnit - bUnit
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)
  })

  return sorted[0] || null
}

function buildCachePayload(
  standardizedIngredientId: string,
  store: string,
  product: ScraperResult
): DB["ingredient_cache"]["Insert"] {
  const now = new Date()
  const expires = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000)

  return {
    standardized_ingredient_id: standardizedIngredientId,
    store: normalizeStoreName(store),
    product_name: product.product_name || product.title || null,
    price: Number(product.price) || 0,
    quantity: Number(product.quantity) || 1,
    unit: product.unit || "unit",
    unit_price: product.unit_price ?? null,
    image_url: product.image_url || null,
    product_id: product.product_id || null,
    location: product.location || null,
    expires_at: expires.toISOString(),
  }
}

async function upsertCacheEntry(
  client: SupabaseLike,
  payload: DB["ingredient_cache"]["Insert"]
): Promise<IngredientCacheResult | null> {
  console.log("[ingredient-pipeline] upsertCacheEntry called", {
    standardized_ingredient_id: payload.standardized_ingredient_id,
    store: payload.store,
    product_id: payload.product_id,
    product_name: payload.product_name,
    price: payload.price,
  })

  // Try onConflict first using the actual DB constraint (2 columns, not 3)
  // The DB has constraint "ingredient_cache_unique_per_store" on (standardized_ingredient_id, store)
  const upsertAttempt = await client
    .from("ingredient_cache")
    .upsert(payload, { onConflict: "standardized_ingredient_id,store" })
    .select("*")
    .maybeSingle()

  if (upsertAttempt.data) {
    console.log("[ingredient-pipeline] Upsert SUCCESS", {
      id: upsertAttempt.data.id,
      store: upsertAttempt.data.store,
      product_name: upsertAttempt.data.product_name,
    })
    return upsertAttempt.data
  }

  if (upsertAttempt.error) {
    console.warn("[ingredient-pipeline] Upsert FAILED", {
      error: upsertAttempt.error.message,
      code: upsertAttempt.error.code,
      details: upsertAttempt.error.details,
      hint: upsertAttempt.error.hint,
    })

    if (!upsertAttempt.error.message.includes("duplicate key value")) {
      console.log("[ingredient-pipeline] Attempting manual fallback path...")
    }
  }

  // Manual fallback: check if entry exists (case-insensitive store match)
  console.log("[ingredient-pipeline] Checking for existing entry...")
  const { data: existing, error: existingError } = await client
    .from("ingredient_cache")
    .select("id")
    .eq("standardized_ingredient_id", payload.standardized_ingredient_id)
    .ilike("store", payload.store)
    .eq("product_id", payload.product_id)
    .maybeSingle()

  if (existingError) {
    console.warn("[ingredient-pipeline] Error checking existing entry", existingError)
  }

  if (existing?.id) {
    console.log("[ingredient-pipeline] Found existing entry, updating...", { existingId: existing.id })
    const { data, error } = await client
      .from("ingredient_cache")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle()
    if (error) {
      console.error("[ingredient-pipeline] UPDATE FAILED", {
        error: error.message,
        code: error.code,
        details: error.details,
      })
      return null
    }
    console.log("[ingredient-pipeline] UPDATE SUCCESS", { id: data?.id })
    return data
  }

  console.log("[ingredient-pipeline] No existing entry, inserting new...")
  const { data, error } = await client
    .from("ingredient_cache")
    .insert(payload)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("[ingredient-pipeline] INSERT FAILED", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })

    // If INSERT failed due to duplicate key, try to fetch and update the existing entry
    if (error.code === '23505') {
      console.log("[ingredient-pipeline] Duplicate key - fetching existing entry to update...")
      const { data: existingData, error: fetchError } = await client
        .from("ingredient_cache")
        .select("*")
        .eq("standardized_ingredient_id", payload.standardized_ingredient_id)
        .ilike("store", payload.store)
        .maybeSingle()

      if (fetchError) {
        console.error("[ingredient-pipeline] Failed to fetch existing entry", fetchError)
        return null
      }

      if (existingData) {
        // Update the existing entry with new data
        const { data: updated, error: updateError } = await client
          .from("ingredient_cache")
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingData.id)
          .select("*")
          .maybeSingle()

        if (updateError) {
          console.error("[ingredient-pipeline] Failed to update existing entry", updateError)
          return existingData // Return old data as fallback
        }

        console.log("[ingredient-pipeline] Updated existing entry after duplicate key error", {
          id: updated?.id,
          store: updated?.store
        })
        return updated || existingData
      }
    }

    return null
  }

  console.log("[ingredient-pipeline] INSERT SUCCESS", { id: data?.id, store: data?.store })
  return data
}

export async function resolveStandardizedIngredientForRecipe(
  supabaseClient: SupabaseLike = createServerClient(),
  recipeId: string,
  rawIngredientName: string
): Promise<string> {
  if (!recipeId) throw new Error("recipeId is required")
  const trimmed = rawIngredientName?.trim()
  if (!trimmed) throw new Error("rawIngredientName is required")

  const { data: existingMapping, error: mappingError } = await supabaseClient
    .from("ingredient_mappings")
    .select("standardized_ingredient_id")
    .eq("recipe_id", recipeId)
    .eq("original_name", trimmed)
    .maybeSingle()

  if (mappingError && mappingError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Failed to read ingredient mapping", mappingError)
  }

  if (existingMapping?.standardized_ingredient_id) {
    return existingMapping.standardized_ingredient_id
  }

  const normalized = normalizeIngredientName(trimmed)
  const maybeExisting = await findStandardizedIngredient(supabaseClient, normalized, trimmed)

  let canonicalName = normalized || trimmed
  if (!maybeExisting) {
    try {
      const aiStandardized = await standardizeIngredientsWithAI([{ id: "0", name: trimmed }], "recipe")
      const aiTop = aiStandardized?.[0]
      canonicalName = aiTop?.canonicalName?.trim() || canonicalName
    } catch (error) {
      console.warn("[ingredient-pipeline] AI standardization failed, falling back to heuristic", error)
    }
  }

  const standardizedId =
    maybeExisting?.id ||
    (await findStandardizedIngredient(supabaseClient, canonicalName, trimmed))?.id ||
    (await createStandardizedIngredient(supabaseClient, canonicalName))

  await ensureIngredientMapping(supabaseClient, recipeId, trimmed, standardizedId)
  return standardizedId
}

/**
 * Batch get or refresh ingredient prices for multiple stores at once
 * OPTIMIZED: Single cache lookup for all stores instead of one per store
 */
export async function getOrRefreshIngredientPricesForStores(
  supabaseClient: SupabaseLike = createServerClient(),
  standardizedIngredientId: string,
  stores: string[],
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult[]> {
  if (!standardizedIngredientId) throw new Error("standardizedIngredientId is required")
  if (!stores || stores.length === 0) return []

  const startTime = Date.now()
  const normalizedStores = stores.map(s => normalizeStoreName(s))

  console.log("[ingredient-pipeline] getOrRefreshIngredientPricesForStores called", {
    standardizedIngredientId,
    stores: normalizedStores,
    zipCode: options.zipCode,
  })

  // OPTIMIZED: Single batched query for all stores
  const { data: cachedItems, error: cacheError } = await supabaseClient
    .from("ingredient_cache")
    .select("*")
    .eq("standardized_ingredient_id", standardizedIngredientId)
    .in("store", normalizedStores)
    .gt("expires_at", new Date().toISOString())

  if (cacheError && cacheError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Batch cache lookup failed", cacheError)
  }

  // Build map of cached stores
  const cachedByStore = new Map<string, IngredientCacheResult>()
  if (cachedItems) {
    for (const item of cachedItems) {
      cachedByStore.set(normalizeStoreName(item.store), item)
    }
  }

  // Identify stores that need scraping
  const storesToScrape = normalizedStores.filter(store => !cachedByStore.has(store))
  const results: IngredientCacheResult[] = Array.from(cachedByStore.values())

  console.log("[ingredient-pipeline] Batch cache check complete", {
    cachedCount: cachedByStore.size,
    storesToScrape,
    timeMs: Date.now() - startTime,
  })

  if (storesToScrape.length === 0) {
    return results
  }

  // If real-time scraping is disabled, return only cached results
  if (options.allowRealTimeScraping === false) {
    console.log("[ingredient-pipeline] Real-time scraping disabled, returning cached results only", {
      cachedStores: Array.from(cachedByStore.keys()),
      missedStores: storesToScrape,
    })
    return results
  }

  // Load canonical name once for all scrapers
  const canonicalName = await loadCanonicalName(supabaseClient, standardizedIngredientId)
  if (!canonicalName) {
    console.warn("[ingredient-pipeline] Missing canonical name for standardized ingredient", { standardizedIngredientId })
    return results
  }

  // Scrape missing stores in parallel
  const scrapePromises = storesToScrape.map(async (store) => {
    const scraped = await runStoreScraper(store, canonicalName, options)
    const bestProduct = pickBestScrapedProduct(scraped)
    if (!bestProduct) return null

    const payload = buildCachePayload(standardizedIngredientId, store, bestProduct)
    return payload
  })

  const scrapeResults = await Promise.all(scrapePromises)
  const validPayloads = scrapeResults.filter((p): p is DB["ingredient_cache"]["Insert"] => p !== null)

  // Batch upsert all scraped results
  if (validPayloads.length > 0) {
    const { data: upsertedData, error: upsertError } = await supabaseClient
      .from("ingredient_cache")
      .upsert(validPayloads, { onConflict: "standardized_ingredient_id,store" })
      .select("*")

    if (upsertError) {
      console.error("[ingredient-pipeline] Batch upsert failed", upsertError)
    } else if (upsertedData) {
      results.push(...upsertedData)
      console.log("[ingredient-pipeline] Batch upserted scraped results", {
        count: upsertedData.length,
        stores: upsertedData.map(d => d.store),
      })
    }
  }

  console.log("[ingredient-pipeline] getOrRefreshIngredientPricesForStores completed", {
    totalResults: results.length,
    totalTimeMs: Date.now() - startTime,
  })

  return results
}

export async function getOrRefreshIngredientPrice(
  supabaseClient: SupabaseLike = createServerClient(),
  standardizedIngredientId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult | null> {
  if (!standardizedIngredientId) throw new Error("standardizedIngredientId is required")
  if (!store) throw new Error("store is required")

  // Normalize store name for cache lookup (handle both "target" and "Target", "99 Ranch" and "99ranch")
  const normalizedStore = normalizeStoreName(store)

  const startTime = Date.now()
  console.log("[ingredient-pipeline] getOrRefreshIngredientPrice called", {
    standardizedIngredientId,
    store,
    normalizedStore,
    zipCode: options.zipCode,
  })

  // Single query to check for cached result - case-insensitive store match
  const { data: cached, error: cacheError } = await supabaseClient
    .from("ingredient_cache")
    .select("*")
    .eq("standardized_ingredient_id", standardizedIngredientId)
    .ilike("store", normalizedStore)
    .order("expires_at", { ascending: false })
    .order("unit_price", { ascending: true, nullsLast: true })
    .order("price", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (cacheError && cacheError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Cache lookup failed", cacheError)
  }

  // Check if cache exists and is still valid
  if (cached) {
    const isExpired = new Date(cached.expires_at) < new Date()
    if (!isExpired) {
      console.log("[ingredient-pipeline] Cache HIT (valid)", {
        store: normalizedStore,
        product_name: cached.product_name,
        price: cached.price,
        expires_at: cached.expires_at,
        timeMs: Date.now() - startTime,
      })
      return cached
    }
    console.log("[ingredient-pipeline] Cache EXPIRED, will scrape", {
      store: normalizedStore,
      product_name: cached.product_name,
      expires_at: cached.expires_at,
      timeMs: Date.now() - startTime,
    })
  } else {
    console.log("[ingredient-pipeline] Cache MISS (not found), will scrape", {
      store: normalizedStore,
      standardizedIngredientId,
      timeMs: Date.now() - startTime,
    })
  }

  // If real-time scraping is disabled, return null for missing/expired cache
  if (options.allowRealTimeScraping === false) {
    console.log("[ingredient-pipeline] Real-time scraping disabled, returning null for missing cache", {
      store: normalizedStore,
      standardizedIngredientId,
    })
    return null
  }

  const canonicalName = await loadCanonicalName(supabaseClient, standardizedIngredientId)
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

  const payload = buildCachePayload(standardizedIngredientId, store, bestProduct)
  const upsertStart = Date.now()
  const result = await upsertCacheEntry(supabaseClient, payload)
  const totalTime = Date.now() - startTime

  console.log("[ingredient-pipeline] getOrRefreshIngredientPrice completed", {
    store: normalizedStore,
    success: !!result,
    upsertTimeMs: Date.now() - upsertStart,
    totalTimeMs: totalTime,
  })

  return result
}

export async function resolveOrCreateStandardizedId(
  supabaseClient: SupabaseLike,
  query: string
): Promise<string> {
  const trimmedQuery = query.trim()

  console.log("[ingredient-pipeline] resolveOrCreateStandardizedId", { query: trimmedQuery })

  // STEP 1: Check if this exact string was previously mapped (from ANY recipe)
  // This leverages historical mappings to improve cache hits
  const mappedId = await findStandardizedIngredientViaMapping(supabaseClient, trimmedQuery)
  if (mappedId) {
    console.log("[ingredient-pipeline] Found via historical mapping", { query: trimmedQuery, mappedId })
    return mappedId
  }

  // STEP 2: Normalize and look for exact/fuzzy match in standardized_ingredients
  const normalized = normalizeIngredientName(trimmedQuery)
  const existing = await findStandardizedIngredient(supabaseClient, normalized, trimmedQuery)
  if (existing?.id) {
    console.log("[ingredient-pipeline] Found via normalized lookup", { query: trimmedQuery, normalized, id: existing.id })
    return existing.id
  }

  // STEP 3: Use AI to get better canonical name
  let canonicalName = normalized || trimmedQuery
  try {
    const aiStandardized = await standardizeIngredientsWithAI([{ id: "0", name: trimmedQuery }], "recipe")
    const aiTop = aiStandardized?.[0]
    canonicalName = aiTop?.canonicalName?.trim() || canonicalName
    console.log("[ingredient-pipeline] AI suggested canonical", { query: trimmedQuery, canonical: canonicalName })
  } catch (error) {
    console.warn("[ingredient-pipeline] AI standardization failed for freeform query, falling back", error)
  }

  // STEP 4: Try lookup with AI-suggested canonical name
  const aiExisting = await findStandardizedIngredient(supabaseClient, canonicalName, trimmedQuery)
  if (aiExisting?.id) {
    console.log("[ingredient-pipeline] Found via AI canonical lookup", { query: trimmedQuery, canonical: canonicalName, id: aiExisting.id })
    return aiExisting.id
  }

  return createStandardizedIngredient(supabaseClient, canonicalName)
}

export async function searchOrCreateIngredientAndPrices(
  supabaseClient: SupabaseLike = createServerClient(),
  query: string,
  stores: string[],
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult[]> {
  if (!query) throw new Error("query is required")
  const standardizedId = await resolveOrCreateStandardizedId(supabaseClient, query)

  // Fetch from all stores in parallel for faster response
  const storePromises = stores.map(async (store) => {
    return getOrRefreshIngredientPrice(supabaseClient, standardizedId, store, options)
  })

  const storeResults = await Promise.all(storePromises)

  return storeResults.filter((row): row is IngredientCacheResult => row !== null)
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
  unit?: string
  recipeId?: string | null
  standardizedIngredientId?: string | null
}

/**
 * @deprecated Use PipelineIngredientInput instead
 * This alias is maintained for backward compatibility during migration.
 */
export type IngredientInput = PipelineIngredientInput

export interface CostEstimate {
  total: number
  priced: PricedIngredient[]
  missing: PipelineIngredientInput[]
}

export async function estimateIngredientCostsForStore(
  supabaseClient: SupabaseLike = createServerClient(),
  items: PipelineIngredientInput[],
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate> {
  const priced: PricedIngredient[] = []
  const missing: PipelineIngredientInput[] = []
  let total = 0

  // Filter valid items first
  const validItems = items.filter(item => item.name?.trim())
  const invalidItems = items.filter(item => !item.name?.trim())
  missing.push(...invalidItems)

  // Process all items in parallel for better performance
  const itemPromises = validItems.map(async (item) => {
    const displayName = item.name!.trim()

    let standardizedId = item.standardizedIngredientId || null
    try {
      if (!standardizedId && item.recipeId) {
        standardizedId = await resolveStandardizedIngredientForRecipe(
          supabaseClient,
          item.recipeId,
          displayName
        )
      }

      if (!standardizedId) {
        standardizedId = await resolveOrCreateStandardizedId(supabaseClient, displayName)
      }
    } catch (error) {
      console.warn("[ingredient-pipeline] Failed to resolve standardized ingredient", {
        item,
        error,
      })
      return { item, success: false, cacheRow: null, standardizedId: null }
    }

    const cacheRow = await getOrRefreshIngredientPrice(supabaseClient, standardizedId, store, options)
    return { item, success: !!cacheRow, cacheRow, standardizedId, displayName }
  })

  const results = await Promise.all(itemPromises)

  // Process results
  for (const result of results) {
    if (!result.success || !result.cacheRow) {
      missing.push(result.item)
    } else {
      const quantityMultiplier = Number.isFinite(result.item.quantity) ? Number(result.item.quantity) : 1
      total += result.cacheRow.price * quantityMultiplier
      priced.push({
        standardizedIngredientId: result.standardizedId!,
        name: result.displayName!,
        cache: result.cacheRow,
      })
    }
  }

  return {
    total: Number(total.toFixed(2)),
    priced,
    missing,
  }
}

export async function updateShoppingListEstimate(
  supabaseClient: SupabaseLike = createServerClient(),
  shoppingListId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate | null> {
  const { data: shoppingList, error } = await supabaseClient
    .from("shopping_lists")
    .select("items")
    .eq("id", shoppingListId)
    .maybeSingle()

  if (error || !shoppingList) {
    console.error("[ingredient-pipeline] Failed to load shopping list", error)
    return null
  }

  const items: IngredientInput[] = Array.isArray(shoppingList.items)
    ? shoppingList.items.map((item: any) => ({
        name: item.name || item.ingredient || "",
        quantity: item.quantity ?? 1,
        unit: item.unit,
        standardizedIngredientId: item.standardized_ingredient_id ?? null,
        recipeId: item.recipe_id ?? null,
      }))
    : []

  const estimate = await estimateIngredientCostsForStore(supabaseClient, items, store, options)

  const { error: updateError } = await supabaseClient
    .from("shopping_lists")
    .update({ total_estimated_cost: estimate.total })
    .eq("id", shoppingListId)

  if (updateError) {
    console.warn("[ingredient-pipeline] Failed to update shopping list total", updateError)
  }

  return estimate
}

export async function updateMealPlanBudget(
  supabaseClient: SupabaseLike = createServerClient(),
  mealPlanId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate | null> {
  const { data: mealPlan, error } = await supabaseClient
    .from("meal_plans")
    .select("shopping_list")
    .eq("id", mealPlanId)
    .maybeSingle()

  if (error || !mealPlan) {
    console.error("[ingredient-pipeline] Failed to load meal plan", error)
    return null
  }

  const items: IngredientInput[] = Array.isArray(mealPlan.shopping_list)
    ? mealPlan.shopping_list.map((item: any) => ({
        name: item.name || item.ingredient || "",
        quantity: item.quantity ?? 1,
        unit: item.unit,
        standardizedIngredientId: item.standardized_ingredient_id ?? null,
        recipeId: item.recipe_id ?? null,
      }))
    : []

  const estimate = await estimateIngredientCostsForStore(supabaseClient, items, store, options)

  const { error: updateError } = await supabaseClient
    .from("meal_plans")
    .update({ total_budget: estimate.total })
    .eq("id", mealPlanId)

  if (updateError) {
    console.warn("[ingredient-pipeline] Failed to update meal plan budget", updateError)
  }

  return estimate
}
