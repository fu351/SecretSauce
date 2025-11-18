import { createServerClient } from "./supabase"

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

    if (existingEntry && Number(existingEntry.price) <= price) {
      // Existing price is cheaper or equal; skip update
      return false
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    // Upsert the cache entry (insert or update if exists)
    const { error } = await client.from("ingredient_cache").upsert(
      {
        standardized_ingredient_id: standardizedIngredientId,
        store,
        product_name: productName || null,
        price,
        quantity,
        unit,
        unit_price: unitPrice,
        image_url: imageUrl,
        product_url: productUrl,
        product_id: productId,
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: "standardized_ingredient_id,store",
      }
    )

    if (error) {
      console.error("Error caching ingredient price:", error)
      return false
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
 * Attempt to resolve a standardized ingredient ID using canonical names or ingredient mappings
 */
async function findStandardizedIngredientIdByName(
  ingredientName: string
): Promise<string | null> {
  try {
    const client = createServerClient()
    const normalizedName = ingredientName.trim().toLowerCase()

    // Try exact canonical name match first
    const { data: exactMatch, error: exactError } = await client
      .from("standardized_ingredients")
      .select("id")
      .eq("canonical_name", normalizedName)
      .maybeSingle()

    if (exactError && exactError.code !== "PGRST116") {
      console.error("Error searching standardized ingredients (exact):", exactError)
    }

    if (exactMatch?.id) {
      return exactMatch.id
    }

    // Try fuzzy canonical name match
    const { data: fuzzyMatch, error: fuzzyError } = await client
      .from("standardized_ingredients")
      .select("id")
      .ilike("canonical_name", `%${normalizedName}%`)
      .limit(1)
      .maybeSingle()

    if (fuzzyError && fuzzyError.code !== "PGRST116") {
      console.error("Error searching standardized ingredients (fuzzy):", fuzzyError)
    }

    if (fuzzyMatch?.id) {
      return fuzzyMatch.id
    }

    // Fall back to ingredient mappings (original recipe names)
    const { data: mappingMatch, error: mappingError } = await client
      .from("ingredient_mappings")
      .select("standardized_ingredient_id")
      .ilike("original_name", `%${normalizedName}%`)
      .limit(1)
      .maybeSingle()

    if (mappingError && mappingError.code !== "PGRST116") {
      console.error("Error searching ingredient mappings:", mappingError)
    }

    if (mappingMatch?.standardized_ingredient_id) {
      return mappingMatch.standardized_ingredient_id
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
  stores?: string[],
  useScraperFallback: boolean = true
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

    // No cache hit; optionally create a new standardized ingredient for scraping
    if (!standardizedId && useScraperFallback) {
      standardizedId = await getOrCreateStandardizedIngredient(normalizedName)
    }

    if (!standardizedId) {
      console.warn(`[Cache] Could not standardize ingredient: ${ingredientName}`)
      return {
        cached: [],
        source: "scraper",
        standardizedId: null,
      }
    }

    console.log(
      `[Cache] No fresh cache found for "${normalizedName}", falling back to scrapers`
    )
    return {
      cached: [],
      source: "scraper",
      standardizedId,
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
  }
): Promise<number> {
  try {
    if (!scrapedItems || scrapedItems.length === 0) {
      return 0
    }

    let cachedCount = 0

    for (const item of scrapedItems) {
      // Get or create standardized ingredient based on title
      let standardizedId =
        options?.standardizedIngredientId ||
        (await getOrCreateStandardizedIngredient(item.title.toLowerCase()))

      if (!standardizedId) {
        console.warn(`Could not standardize ingredient: ${item.title}`)
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
      const success = await cacheIngredientPrice(
        standardizedId,
        item.provider,
        item.title,
        item.price,
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
    }

    return cachedCount
  } catch (error) {
    console.error("Error caching scraped results:", error)
    return 0
  }
}
