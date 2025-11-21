import { createServerClient } from "./supabase"
import { standardizeIngredientsWithAI } from "./ingredient-standardizer"

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
  product_url: string | null
  product_id: string | null
  expires_at: string
}

type SupabaseClientType = ReturnType<typeof createServerClient>
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

const STANDARDIZED_CACHE_TTL_MS = 1000 * 60 * 5
let standardizedIngredientCache: StandardizedIngredientRow[] | null = null
let standardizedIngredientCacheExpiresAt = 0
const standardizedIngredientIndex = new Map<string, StandardizedIngredientRow>()

function simplifyIngredientTokens(value: string): string {
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

async function loadStandardizedIngredientCache(client: SupabaseClientType): Promise<StandardizedIngredientRow[]> {
  if (standardizedIngredientCache && Date.now() < standardizedIngredientCacheExpiresAt) {
    return standardizedIngredientCache
  }

  const { data, error } = await client.from("standardized_ingredients").select("id, canonical_name, category")
  if (error || !data) {
    console.error("Error loading standardized ingredients for lookup:", error)
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
    const client = createServerClient()
    const { data, error } = await client
      .from("standardized_ingredients")
      .select("id, canonical_name, category")
      .eq("id", standardizedIngredientId)
      .maybeSingle()

    if (error || !data) {
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
 * Uses fuzzy matching on ingredient name against standardized_ingredients
 */
export async function searchIngredientCache(
  searchTerm: string,
  stores?: string[]
): Promise<CachedIngredient[]> {
  try {
    const client = createServerClient()
    const normalizedSearch = searchTerm.trim().toLowerCase()

    // First, find standardized ingredients matching the search term
    const { data: standardizedIngredients, error: stdError } = await client
      .from("standardized_ingredients")
      .select("id")
      .ilike("canonical_name", `%${normalizedSearch}%`)

    if (stdError) {
      console.error("Error searching standardized ingredients:", stdError)
      return []
    }

    if (!standardizedIngredients || standardizedIngredients.length === 0) {
      return []
    }

    const ingredientIds = standardizedIngredients.map((ing) => ing.id)

    // Query the cache for non-expired items matching the standardized ingredients
    let query = client
      .from("ingredient_cache")
      .select("*")
      .in("standardized_ingredient_id", ingredientIds)
      .gt("expires_at", new Date().toISOString())

    // Filter by stores if provided
    if (stores && stores.length > 0) {
      query = query.in("store", stores)
    }

    const { data: cachedItems, error: cacheError } = await query

    if (cacheError) {
      console.error("Error searching ingredient cache:", cacheError)
      return []
    }

    return cachedItems || []
  } catch (error) {
    console.error("Error in searchIngredientCache:", error)
    return []
  }
}

/**
 * Get all cached ingredients for a specific standardized ingredient ID
 */
export async function getCachedIngredientById(
  standardizedIngredientId: string,
  stores?: string[]
): Promise<CachedIngredient[]> {
  try {
    const client = createServerClient()

    let query = client
      .from("ingredient_cache")
      .select("*")
      .eq("standardized_ingredient_id", standardizedIngredientId)
      .gt("expires_at", new Date().toISOString())

    if (stores && stores.length > 0) {
      query = query.in("store", stores)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error getting cached ingredient:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error in getCachedIngredientById:", error)
    return []
  }
}

/**
 * Store or update a scraped ingredient in the cache
 * Expires in 24 hours
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
    const client = createServerClient()

    // Check existing entry for this ingredient/store
    const { data: existingEntry, error: existingError } = await client
      .from("ingredient_cache")
      .select("id, price")
      .eq("standardized_ingredient_id", standardizedIngredientId)
      .eq("store", store)
      .maybeSingle()

    if (existingError && existingError.code !== "PGRST116") {
      console.error("Error checking existing ingredient cache entry:", existingError)
      return false
    }

    const normalizedPrice = Number(price)
    const priceValue = Number.isFinite(normalizedPrice) ? normalizedPrice : 0

    let existingPriceValue: number | null = null
    if (existingEntry && existingEntry.price !== null && existingEntry.price !== undefined) {
      const parsedExisting = Number(existingEntry.price)
      if (Number.isFinite(parsedExisting)) {
        existingPriceValue = parsedExisting
      }
    }

    if (existingPriceValue !== null && existingPriceValue <= priceValue) {
      console.log("[Cache] Skipping update because cached price is cheaper or equal", {
        store,
        standardizedIngredientId,
        existingPrice: existingPriceValue,
        newPrice: priceValue,
      })
      return false
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const payload = {
      standardized_ingredient_id: standardizedIngredientId,
      store,
      product_name: productName || null,
      price: priceValue,
      quantity,
      unit,
      unit_price: unitPrice,
      image_url: imageUrl,
      product_url: productUrl,
      product_id: productId,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existingEntry) {
      const { error } = await client.from("ingredient_cache").update(payload).eq("id", existingEntry.id)
      if (error) {
        console.error("Error updating ingredient cache:", error)
        return false
      }
      console.log("[Cache] Updated ingredient price", {
        store,
        standardizedIngredientId,
        productName,
        price: priceValue,
      })
    } else {
      const { error } = await client.from("ingredient_cache").insert(payload)
      if (error) {
        console.error("Error inserting ingredient cache:", error)
        return false
      }
      console.log("[Cache] Inserted ingredient price", {
        store,
        standardizedIngredientId,
        productName,
        price: priceValue,
      })
    }
    return true
  } catch (error) {
    console.error("Error in cacheIngredientPrice:", error)
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
    const client = createServerClient()

    // Check if it exists
    const { data: existing, error: searchError } = await client
      .from("standardized_ingredients")
      .select("id")
      .eq("canonical_name", canonicalName)
      .single()

    if (existing) {
      return existing.id
    }

    if (searchError && searchError.code !== "PGRST116") {
      // PGRST116 = not found, which is expected
      console.error("Error searching for standardized ingredient:", searchError)
      return null
    }

    // Create new standardized ingredient
    const { data: newIngredient, error: createError } = await client
      .from("standardized_ingredients")
      .insert({
        canonical_name: canonicalName,
        category,
      })
      .select("id")
      .single()

    if (createError) {
      console.error("Error creating standardized ingredient:", createError)
      return null
    }

    return newIngredient?.id || null
  } catch (error) {
    console.error("Error in getOrCreateStandardizedIngredient:", error)
    return null
  }
}

/**
 * Clean up expired cache entries (for manual cleanup or scheduled job)
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const client = createServerClient()

    const { count, error } = await client
      .from("ingredient_cache")
      .delete()
      .lt("expires_at", new Date().toISOString())

    if (error) {
      console.error("Error cleaning up expired cache:", error)
      return 0
    }

    console.log(`Cleaned up ${count} expired cache entries`)
    return count || 0
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
    const client = createServerClient()

    const { error } = await client.from("ingredient_mappings").insert({
      recipe_id: recipeId,
      original_name: originalName,
      standardized_ingredient_id: standardizedIngredientId,
    })

    if (error && error.code !== "23505") {
      // 23505 = unique constraint violation, which is fine (mapping already exists)
      console.error("Error creating ingredient mapping:", error)
      return false
    }

    return true
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
    const client = createServerClient()

    const { data, error } = await client
      .from("ingredient_mappings")
      .select("standardized_ingredient_id")
      .eq("recipe_id", recipeId)
      .eq("original_name", originalName)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      console.error("Error getting ingredient mapping:", error)
      return null
    }

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
async function upsertFreeformMapping(originalName: string, standardizedIngredientId: string): Promise<void> {
  if (!originalName || !standardizedIngredientId) return
  try {
    const client = createServerClient()
    const { error } = await client
      .from("ingredient_mappings")
      .upsert(
        {
          recipe_id: null,
          original_name: originalName,
          standardized_ingredient_id: standardizedIngredientId,
        },
        { onConflict: "recipe_id,original_name" }
      )
    if (error) {
      console.warn("[Cache] Failed to upsert freeform mapping", { originalName, error })
    }
  } catch (error) {
    console.warn("[Cache] Error in upsertFreeformMapping", error)
  }
}

/**
 * Attempt to resolve a standardized ingredient ID using canonical names or ingredient mappings
 */
async function findStandardizedIngredientIdByName(
  ingredientName: string
): Promise<string | null> {
  try {
    const client = createServerClient()
    const variants = buildSearchVariants(ingredientName)

    if (variants.length === 0) {
      return null
    }

    const canonicalList = await loadStandardizedIngredientCache(client)

    for (const variant of variants) {
      const directMatch = canonicalList.find((entry) => entry.canonical_name === variant)
      if (directMatch) {
        return directMatch.id
      }
    }

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

    for (const variant of variants) {
      const { data: mappingMatch, error: mappingError } = await client
        .from("ingredient_mappings")
        .select("standardized_ingredient_id")
        .ilike("original_name", `%${variant}%`)
        .limit(1)
        .maybeSingle()

      if (mappingError && mappingError.code !== "PGRST116") {
        console.error("Error searching ingredient mappings:", mappingError)
        continue
      }

      if (mappingMatch?.standardized_ingredient_id) {
        return mappingMatch.standardized_ingredient_id
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

  for (const ingredient of ingredients) {
    const result = await searchWithCache(ingredient, stores)
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
          await upsertFreeformMapping(mappingName, sharedStandardizedId)
          if (options?.recipeId) {
            await mapIngredientToStandardized(options.recipeId, searchTermForLookup, sharedStandardizedId)
          }
        }
      }
    }

    if (!sharedStandardizedId && normalizedSearchName) {
      const createdId = await getOrCreateStandardizedIngredient(normalizedSearchName, null)
      if (createdId) {
        sharedStandardizedId = createdId
        await upsertFreeformMapping(normalizedSearchName, createdId)
      }
    }

    // Cache each item, allowing per-item resolution when the shared ID is unavailable
    const aiTitleCache = new Map<string, string | null>()
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

      // Cache the item
      const priceValue = Number(item.price)
      const success = await cacheIngredientPrice(
        standardizedId,
        item.provider,
        item.title,
        Number.isFinite(priceValue) ? priceValue : 0,
        1, // quantity
        item.unit || "unit",
        unitPrice,
        item.image_url || null,
        item.product_url || null,
        item.product_id || null
      )

      if (success) {
        cachedCount++
      }
    }

    if (cachedCount > 0) {
      console.log(
        `[Cache] Cached ${cachedCount}/${scrapedItems.length} scraped items`
      )
    } else {
      console.warn("[Cache] No items cached from scrape batch", {
        searchTerm: searchTermForLookup,
        sharedStandardizedId,
      })
    }

    return cachedCount
  } catch (error) {
    console.error("Error caching scraped results:", error)
    return 0
  }
}
