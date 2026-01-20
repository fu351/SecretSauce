import { standardizeIngredientsWithAI } from "./ingredient-standardizer"
import { ingredientCacheDB } from "./database/ingredient-cache-db"
import { standardizedIngredientsDB } from "./database/standardized-ingredients-db"
import { ingredientMappingsDB } from "./database/ingredient-mappings-db"

export interface CachedIngredient {
  id: string
  standardized_ingredient_id: string
  store: string
  product_name: string | null
  price: number
  quantity: number
  unit: string
  unit_price: number | null
  image_url: string | null
  product_url?: string | null
  product_id: string | null
  location?: string | null
  expires_at: string
  created_at?: string | null
  updated_at?: string | null
}

type StandardizedIngredientRow = { id: string; canonical_name: string; category?: string | null }

const INGREDIENT_STOP_WORDS = new Set([
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

/**
 * Store-specific cache TTL in hours
 * Different stores update prices at different frequencies
 */
const STORE_CACHE_TTL_HOURS: Record<string, number> = {
  // Frequent price changes
  walmart: 12,
  target: 12,
  kroger: 18,
  meijer: 18,

  // Moderate updates
  safeway: 24,
  wholefoods: 24,
  whole_foods: 24,
  andronicos: 24,

  // Stable prices
  traderjoes: 48,
  aldi: 36,
  "99ranch": 48,
  ranch99: 48,
}

const DEFAULT_CACHE_TTL_HOURS = 24

/**
 * Normalize store name for consistent cache lookups
 * Converts to lowercase and removes spaces: "99 Ranch" → "99ranch", "Trader Joes" → "traderjoes"
 */
export function normalizeStoreName(store: string): string {
  return store.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim()
}

/**
 * Get cache TTL for a specific store
 */
export function getCacheTTLForStore(store: string): number {
  const normalizedStore = normalizeStoreName(store)
  return STORE_CACHE_TTL_HOURS[normalizedStore] || DEFAULT_CACHE_TTL_HOURS
}

const STANDARDIZED_CACHE_TTL_MS = 1000 * 60 * 5
let standardizedIngredientCache: StandardizedIngredientRow[] | null = null
let standardizedIngredientCacheExpiresAt = 0
const standardizedIngredientIndex = new Map<string, StandardizedIngredientRow>()

export function simplifyIngredientTokens(value: string): string {
  return value
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !INGREDIENT_STOP_WORDS.has(token))
    .join(" ")
    .trim()
}

function normalizeIngredientKey(value?: string | null): string | null {
  if (!value) return null
  const normalized = simplifyIngredientTokens(value.toLowerCase())
  return normalized || null
}

function buildSearchVariants(value: string): string[] {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return []

  const variants = new Set<string>()
  variants.add(normalized.replace(/\s+/g, " "))

  const beforeComma = normalized.split(",")[0]?.trim()
  if (beforeComma) {
    variants.add(beforeComma)
  }

  const withoutParens = normalized.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim()
  if (withoutParens) {
    variants.add(withoutParens)
  }

  const slashSplit = normalized.split("/")[0]?.trim()
  if (slashSplit) {
    variants.add(slashSplit)
  }

  const simplified = simplifyIngredientTokens(normalized)
  if (simplified) {
    variants.add(simplified)
  }

  return Array.from(variants).filter(Boolean)
}

async function loadStandardizedIngredientCache(): Promise<StandardizedIngredientRow[]> {
  if (standardizedIngredientCache && Date.now() < standardizedIngredientCacheExpiresAt) {
    return standardizedIngredientCache
  }

  const data = await standardizedIngredientsDB.findAll()
  if (!data || data.length === 0) {
    console.error("Error loading standardized ingredients for lookup")
    return []
  }

  standardizedIngredientCache = data.map((row) => ({
    id: row.id,
    canonical_name: row.canonical_name.toLowerCase().trim(),
    category: row.category ?? null,
  }))
  standardizedIngredientCacheExpiresAt = Date.now() + STANDARDIZED_CACHE_TTL_MS
  standardizedIngredientIndex.clear()
  standardizedIngredientCache.forEach((row) => {
    standardizedIngredientIndex.set(row.id, row)
  })
  return standardizedIngredientCache
}

export async function getStandardizedIngredientMetadata(
  standardizedIngredientId: string
): Promise<StandardizedIngredientRow | null> {
  if (!standardizedIngredientId) return null
  if (standardizedIngredientIndex.has(standardizedIngredientId)) {
    return standardizedIngredientIndex.get(standardizedIngredientId)!
  }

  try {
    const data = await standardizedIngredientsDB.findById(standardizedIngredientId)

    if (!data) {
      return null
    }

    const normalized: StandardizedIngredientRow = {
      id: data.id,
      canonical_name: data.canonical_name.toLowerCase().trim(),
      category: data.category ?? null,
    }
    standardizedIngredientIndex.set(normalized.id, normalized)
    return normalized
  } catch (error) {
    console.error("Error loading standardized ingredient metadata:", error)
    return null
  }
}

/**
 * Search ingredient cache for matching ingredients that haven't expired
 * Uses advanced fuzzy matching with variants, full-text search, and trigrams
 * OPTIMIZED: Uses PostgreSQL search_standardized_ingredients() function if available
 */
export async function searchIngredientCache(
  searchTerm: string,
  stores?: string[]
): Promise<CachedIngredient[]> {
  try {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return []
    }

    console.log("[Cache] Searching for", { originalTerm: searchTerm })

    let ingredientIds: string[] = []

    // Try using text search on standardized ingredients
    const searchResults = await standardizedIngredientsDB.searchByText(normalizedSearch, { limit: 20 })

    if (searchResults && searchResults.length > 0) {
      ingredientIds = searchResults.map(r => r.id)
      console.log("[Cache] Found matches via text search", {
        count: ingredientIds.length
      })
    }

    // Fallback to variant-based search if text search didn't work
    if (ingredientIds.length === 0) {
      const searchVariants = buildSearchVariants(normalizedSearch)
      if (searchVariants.length === 0) {
        return []
      }

      console.log("[Cache] Searching with variants", { variants: searchVariants })

      const variantResults = await standardizedIngredientsDB.searchByVariants(searchVariants)

      if (variantResults && variantResults.length > 0) {
        ingredientIds = variantResults.map(ing => ing.id)
        console.log("[Cache] Found variant matches", { count: ingredientIds.length })
      }
    }

    if (ingredientIds.length === 0) {
      return []
    }

    // Query the cache for non-expired items matching the standardized ingredients
    const cachedItems = await ingredientCacheDB.findByStandardizedIds(ingredientIds, stores)

    console.log("[Cache] Found cached items", {
      count: cachedItems?.length || 0,
      stores: cachedItems?.map(c => c.store) || []
    })

    return cachedItems || []
  } catch (error) {
    console.error("Error in searchIngredientCache:", error)
    return []
  }
}

/**
 * Get all cached ingredients for a specific standardized ingredient ID
 * OPTIMIZED: Normalizes store names for consistent cache lookups
 */
export async function getCachedIngredientById(
  standardizedIngredientId: string,
  stores?: string[]
): Promise<CachedIngredient[]> {
  try {
    const data = await ingredientCacheDB.findByStandardizedId(standardizedIngredientId, stores)

    console.log("[Cache] getCachedIngredientById results", {
      standardizedIngredientId,
      count: data?.length || 0,
      stores: data?.map(d => d.store) || []
    })

    return data || []
  } catch (error) {
    console.error("Error in getCachedIngredientById:", error)
    return []
  }
}

/**
 * Store or update a scraped ingredient in the cache
 * Expires based on store-specific TTL (12-48 hours)
 */
export async function cacheIngredientPrice(
  standardizedIngredientId: string,
  store: string,
  productName: string | null = null,
  price: number,
  quantity: number,
  unit: string,
  unitPrice: number | null = null,
  imageUrl: string | null = null,
  productUrl: string | null = null,
  productId: string | null = null
): Promise<boolean> {
  try {
    const normalizedPrice = Number(price)
    const priceValue = Number.isFinite(normalizedPrice) ? normalizedPrice : 0

    const result = await ingredientCacheDB.cachePrice(
      standardizedIngredientId,
      store,
      priceValue,
      quantity,
      unit,
      {
        unitPrice,
        imageUrl,
        productName,
        productId,
        location: null
      }
    )

    if (result) {
      console.log("[Cache] Cached ingredient price", {
        store,
        standardizedIngredientId,
        productName,
        price: priceValue,
      })
      return true
    }

    return false
  } catch (error) {
    console.error("Error in cacheIngredientPrice:", error)
    return false
  }
}

/**
 * Batch get or create standardized ingredients
 * OPTIMIZED: Single upsert for all items instead of one per ingredient
 */
export async function batchGetOrCreateStandardizedIngredients(
  items: Array<{ canonicalName: string; category: string | null }>
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>()
  if (!items || items.length === 0) return resultMap

  try {
    // Normalize all names
    const normalizedItems = items.map(item => ({
      canonicalName: item.canonicalName.trim().toLowerCase(),
      category: item.category,
    }))

    // Single batch upsert using the DB class
    const idMap = await standardizedIngredientsDB.batchGetOrCreate(normalizedItems)

    // Build result map and update cache
    for (const [canonicalName, id] of idMap.entries()) {
      const normalized: StandardizedIngredientRow = {
        id,
        canonical_name: canonicalName.toLowerCase(),
        category: items.find(i => i.canonicalName.toLowerCase() === canonicalName)?.category ?? null,
      }
      standardizedIngredientIndex.set(id, normalized)
      resultMap.set(canonicalName.toLowerCase(), id)
    }

    return resultMap
  } catch (error) {
    console.error("Error in batchGetOrCreateStandardizedIngredients:", error)
    return resultMap
  }
}

/**
 * Batch create ingredient mappings
 * OPTIMIZED: Single insert for all mappings instead of one per ingredient
 */
export async function batchMapIngredientsToStandardized(
  recipeId: string,
  mappings: Array<{ originalName: string; standardizedIngredientId: string }>
): Promise<boolean> {
  if (!mappings || mappings.length === 0) return true

  try {
    return await ingredientMappingsDB.batchUpsertMappings(recipeId, mappings)
  } catch (error) {
    console.error("Error in batchMapIngredientsToStandardized:", error)
    return false
  }
}

/**
 * Get or create a standardized ingredient by name
 */
export async function getOrCreateStandardizedIngredient(
  canonicalName: string,
  category: string | null = null
): Promise<string | null> {
  try {
    const normalizedCanonical = canonicalName.trim().toLowerCase()

    const result = await standardizedIngredientsDB.getOrCreate(normalizedCanonical, category)

    if (result?.id) {
      const normalized: StandardizedIngredientRow = {
        id: result.id,
        canonical_name: result.canonical_name?.toLowerCase() || normalizedCanonical,
        category: result.category ?? category ?? null,
      }
      standardizedIngredientIndex.set(normalized.id, normalized)
      return result.id
    }

    return null
  } catch (error) {
    console.error("Error in getOrCreateStandardizedIngredient:", error)
    return null
  }
}

/**
 * Batch upsert multiple cache entries at once
 * OPTIMIZED: Single query instead of one per item, uses store-specific TTL
 */
export async function batchCacheIngredientPrices(
  items: Array<{
    standardizedIngredientId: string
    store: string
    productName: string | null
    price: number
    quantity: number
    unit: string
    unitPrice: number | null
    imageUrl: string | null
    productUrl: string | null
    productId: string | null
  }>
): Promise<number> {
  if (!items || items.length === 0) return 0

  try {
    const batchItems = items.map(item => ({
      standardizedIngredientId: item.standardizedIngredientId,
      store: item.store,
      price: Number.isFinite(item.price) ? item.price : 0,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      imageUrl: item.imageUrl,
      productName: item.productName,
      productId: item.productId,
      location: null
    }))

    const count = await ingredientCacheDB.batchCachePrices(batchItems)

    console.log(`[Cache] Batch upserted ${count} items`)
    return count
  } catch (error) {
    console.error("[Cache] Error in batchCacheIngredientPrices:", error)
    return 0
  }
}

/**
 * Clean up expired cache entries (for manual cleanup or scheduled job)
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const count = await ingredientCacheDB.cleanupExpired()

    console.log(`Cleaned up ${count} expired cache entries`)
    return count
  } catch (error) {
    console.error("Error in cleanupExpiredCache:", error)
    return 0
  }
}

/**
 * Get or create ingredient mapping for recipe ingredients
 * Maps original ingredient names to standardized ingredient IDs
 */
export async function mapIngredientToStandardized(
  recipeId: string,
  originalName: string,
  standardizedIngredientId: string
): Promise<boolean> {
  try {
    const result = await ingredientMappingsDB.upsertMapping(recipeId, originalName, standardizedIngredientId)
    return result !== null
  } catch (error) {
    console.error("Error in mapIngredientToStandardized:", error)
    return false
  }
}

/**
 * Get standardized ingredient ID for a recipe ingredient using mapping
 */
export async function getMappedIngredient(
  recipeId: string,
  originalName: string
): Promise<string | null> {
  try {
    const data = await ingredientMappingsDB.findByRecipeAndName(recipeId, originalName)
    return data?.standardized_ingredient_id || null
  } catch (error) {
    console.error("Error in getMappedIngredient:", error)
    return null
  }
}

/**
 * Upsert a freeform search term -> standardized ingredient mapping (non-recipe context)
 * Useful for custom searches so we reuse the same canonical ID next time.
 */
async function upsertFreeformMapping(
  originalName: string,
  standardizedIngredientId: string,
  recipeId?: string | null
): Promise<void> {
  if (!recipeId || !originalName || !standardizedIngredientId) return
  try {
    const result = await ingredientMappingsDB.upsertMapping(recipeId, originalName, standardizedIngredientId)
    if (!result) {
      console.warn("[Cache] Failed to upsert freeform mapping", { originalName })
    }
  } catch (error) {
    console.warn("[Cache] Error in upsertFreeformMapping", error)
  }
}

/**
 * Attempt to resolve a standardized ingredient ID using canonical names or ingredient mappings
 * OPTIMIZED: Uses single batched query instead of per-variant loop
 */
async function findStandardizedIngredientIdByName(
  ingredientName: string
): Promise<string | null> {
  try {
    const variants = buildSearchVariants(ingredientName.toLowerCase())

    if (variants.length === 0) {
      return null
    }

    // First check in-memory cache (no DB queries needed)
    const canonicalList = await loadStandardizedIngredientCache()

    // Direct match check - O(n) in memory, no DB call
    for (const variant of variants) {
      const directMatch = canonicalList.find((entry) => entry.canonical_name === variant)
      if (directMatch) {
        return directMatch.id
      }
    }

    // Contains match check - O(n) in memory, no DB call
    for (const variant of variants) {
      if (variant.length < 3) continue
      const containsMatch = canonicalList.find(
        (entry) =>
          entry.canonical_name.includes(variant) ||
          variant.includes(entry.canonical_name)
      )
      if (containsMatch) {
        return containsMatch.id
      }
    }

    // Try to find via ingredient mappings
    const validVariants = variants.filter(v => v.length >= 2)
    if (validVariants.length > 0) {
      // Try searching with the first variant
      const variantResults = await standardizedIngredientsDB.searchByVariants([validVariants[0]])

      if (variantResults && variantResults.length > 0) {
        return variantResults[0].id
      }
    }

    return null
  } catch (error) {
    console.error("Error resolving standardized ingredient ID:", error)
    return null
  }
}

/**
 * Intelligent search: Check cache first, return fresh results if available
 * This prevents unnecessary scraping when data is already cached
 */
export async function searchWithCache(
  ingredientName: string,
  stores?: string[]
): Promise<{
  cached: CachedIngredient[]
  source: "cache" | "scraper"
  standardizedId: string | null
}> {
  try {
    const normalizedName = ingredientName.trim().toLowerCase()
    console.log(`[Cache] Searching for "${normalizedName}" in cache...`)

    // Try fuzzy cache lookup first
    const fuzzyCache = await searchIngredientCache(normalizedName, stores)
    if (fuzzyCache && fuzzyCache.length > 0) {
      console.log(
        `[Cache] Found ${fuzzyCache.length} cached results for "${normalizedName}" via fuzzy search`
      )
      return {
        cached: fuzzyCache,
        source: "cache",
        standardizedId: fuzzyCache[0]?.standardized_ingredient_id || null,
      }
    }

    // Try to resolve an existing standardized ingredient ID
    let standardizedId =
      (await findStandardizedIngredientIdByName(normalizedName)) || null

    // If we resolved an ID, explicitly fetch cache entries for it (covers mapped names)
    if (standardizedId) {
      const cachedById = await getCachedIngredientById(standardizedId, stores)
      if (cachedById && cachedById.length > 0) {
        console.log(
          `[Cache] Found ${cachedById.length} cached results for "${normalizedName}" via mapped ID`
        )
        return {
          cached: cachedById,
          source: "cache",
          standardizedId,
        }
      }
    }

    console.log(
      `[Cache] No fresh cache found for "${normalizedName}", falling back to scrapers`
    )
    return {
      cached: [],
      source: "scraper",
      standardizedId: standardizedId ?? null,
    }
  } catch (error) {
    console.error("Error in searchWithCache:", error)
    return {
      cached: [],
      source: "scraper",
      standardizedId: null,
    }
  }
}

/**
 * Batch search multiple ingredients with cache checking
 * Useful for recipe ingredient lists
 * OPTIMIZED: Parallelized with Promise.all instead of sequential loop
 */
export async function batchSearchWithCache(
  ingredients: string[],
  stores?: string[]
): Promise<
  Map<
    string,
    {
      cached: CachedIngredient[]
      source: "cache" | "scraper"
      standardizedId: string | null
    }
  >
> {
  const results = new Map()

  // OPTIMIZED: Run all searches in parallel instead of sequentially
  const searchPromises = ingredients.map(async (ingredient) => {
    const result = await searchWithCache(ingredient, stores)
    return { ingredient, result }
  })

  const searchResults = await Promise.all(searchPromises)

  for (const { ingredient, result } of searchResults) {
    results.set(ingredient, result)
  }

  return results
}

/**
 * Cache scraped grocery items to the ingredient_cache table
 * Called after successful scraping to populate the cache
 */
export async function cacheScrapedResults(
  scrapedItems: Array<{
    title: string
    brand?: string
    price: number
    pricePerUnit?: string
    unit?: string
    image_url?: string
    provider: string
    product_url?: string
    product_id?: string
  }>,
  options?: {
    standardizedIngredientId?: string | null
    searchTerm?: string
    recipeId?: string | null
  }
): Promise<number> {
  try {
    console.log("[Cache] Starting cacheScrapedResults", {
      itemCount: scrapedItems?.length ?? 0,
      searchTerm: options?.searchTerm,
      standardizedIngredientId: options?.standardizedIngredientId,
      recipeId: options?.recipeId,
    })
    if (!scrapedItems || scrapedItems.length === 0) {
      return 0
    }

    let cachedCount = 0
    const searchTermForLookup = options?.searchTerm?.trim()
    const normalizedSearchName = normalizeIngredientKey(searchTermForLookup) || null

    // Resolve or create a standardized ingredient ID once per batch
    let sharedStandardizedId = options?.standardizedIngredientId || null

    if (!sharedStandardizedId && searchTermForLookup) {
      sharedStandardizedId = await findStandardizedIngredientIdByName(searchTermForLookup)
    }

    if (!sharedStandardizedId && normalizedSearchName) {
      sharedStandardizedId = await findStandardizedIngredientIdByName(normalizedSearchName)
    }

    if (!sharedStandardizedId && searchTermForLookup) {
      const aiStandardized = await standardizeIngredientsWithAI(
        [{ id: "0", name: searchTermForLookup }],
        "recipe"
      )
      const aiTop = aiStandardized?.[0]
      const canonicalName = aiTop?.canonicalName?.trim()
      if (canonicalName) {
        const existingId = await findStandardizedIngredientIdByName(canonicalName)
        if (existingId) {
          sharedStandardizedId = existingId
        } else {
          const createdId = await getOrCreateStandardizedIngredient(canonicalName, aiTop?.category ?? null)
          if (createdId) {
            sharedStandardizedId = createdId
          }
        }
        if (sharedStandardizedId) {
          const mappingName = normalizedSearchName || searchTermForLookup
          if (options?.recipeId) {
            await upsertFreeformMapping(mappingName, sharedStandardizedId, options.recipeId)
            await mapIngredientToStandardized(options.recipeId, searchTermForLookup, sharedStandardizedId)
          }
        }
      }
    }

    if (!sharedStandardizedId && normalizedSearchName) {
      const createdId = await getOrCreateStandardizedIngredient(normalizedSearchName, null)
      if (createdId) {
        sharedStandardizedId = createdId
        if (options?.recipeId) {
          await upsertFreeformMapping(normalizedSearchName, createdId, options.recipeId)
        }
      }
    }

    // OPTIMIZED: Collect all items for batch insert instead of per-item DB calls
    const aiTitleCache = new Map<string, string | null>()
    const cachePayloads: Array<{
      standardizedIngredientId: string
      store: string
      productName: string | null
      price: number
      quantity: number
      unit: string
      unitPrice: number | null
      imageUrl: string | null
      productUrl: string | null
      productId: string | null
    }> = []

    for (const item of scrapedItems) {
      let standardizedId = sharedStandardizedId

      // If the batch-level ID didn't resolve, try per-item matching to keep cache warm
      if (!standardizedId) {
        const normalizedTitle = normalizeIngredientKey(item.title) || item.title?.trim()
        if (normalizedTitle) {
          standardizedId = await findStandardizedIngredientIdByName(normalizedTitle)
        }
      }

      // As a last resort, attempt AI standardization on the item title
      if (!standardizedId && item.title) {
        const titleKey = item.title.trim().toLowerCase()
        if (!aiTitleCache.has(titleKey)) {
          const aiStandardized = await standardizeIngredientsWithAI([{ id: "0", name: item.title }], "recipe")
          const aiTop = aiStandardized?.[0]
          const canonicalName = aiTop?.canonicalName?.trim()
          let resolvedId: string | null = null
          if (canonicalName) {
            resolvedId = (await findStandardizedIngredientIdByName(canonicalName)) || null
            if (!resolvedId) {
              resolvedId = (await getOrCreateStandardizedIngredient(canonicalName, aiTop?.category ?? null)) || null
            }
          }
          aiTitleCache.set(titleKey, resolvedId)
        }
        standardizedId = aiTitleCache.get(titleKey) || null
      }

      if (!standardizedId && item.title) {
        const fallbackName = normalizeIngredientKey(item.title) || item.title.trim()
        if (fallbackName) {
          const createdId = await getOrCreateStandardizedIngredient(fallbackName, null)
          if (createdId) {
            standardizedId = createdId
            await upsertFreeformMapping(fallbackName, createdId)
          }
        }
      }

      if (!standardizedId) {
        console.warn(`[Cache] Could not map scraped item to standardized ingredient`, {
          title: item.title,
          searchTerm: searchTermForLookup,
        })
        continue
      }

      // Parse unit price if available
      let unitPrice: number | null = null
      if (item.pricePerUnit) {
        const priceMatch = item.pricePerUnit.match(/\$?([\d.]+)/)
        if (priceMatch) {
          unitPrice = parseFloat(priceMatch[1])
        }
      }

      // Collect payload for batch insert
      cachePayloads.push({
        standardizedIngredientId: standardizedId,
        store: item.provider,
        productName: item.title,
        price: Number(item.price),
        quantity: 1,
        unit: item.unit || "unit",
        unitPrice,
        imageUrl: item.image_url || null,
        productUrl: item.product_url || null,
        productId: item.product_id || null,
      })
    }

    // OPTIMIZED: Single batch upsert instead of per-item calls
    if (cachePayloads.length > 0) {
      cachedCount = await batchCacheIngredientPrices(cachePayloads)
      console.log(
        `[Cache] Batch cached ${cachedCount}/${scrapedItems.length} scraped items`
      )
    } else {
      console.warn("[Cache] No items to cache from scrape batch", {
        searchTerm: searchTermForLookup,
        sharedStandardizedId,
        itemCount: scrapedItems.length,
      })
    }

    return cachedCount
  } catch (error) {
    console.error("Error caching scraped results:", error)
    return 0
  }
}
