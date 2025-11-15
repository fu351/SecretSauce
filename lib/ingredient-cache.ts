import { createServerClient } from "./supabase"

export interface CachedIngredient {
  id: string
  standardized_ingredient_id: string
  store: string
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

    // First, find standardized ingredients matching the search term
    const { data: standardizedIngredients, error: stdError } = await client
      .from("standardized_ingredients")
      .select("id")
      .ilike("canonical_name", `%${searchTerm}%`)

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

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    // Upsert the cache entry (insert or update if exists)
    const { error } = await client.from("ingredient_cache").upsert(
      {
        standardized_ingredient_id: standardizedIngredientId,
        store,
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