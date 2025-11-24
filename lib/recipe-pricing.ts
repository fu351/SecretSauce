import { createServerClient } from "./supabase"

export interface StorePricing {
  store: string
  total: number
  items: Array<{
    ingredient: string
    price: number
    quantity: number
    unit: string
  }>
}

export interface RecipePricingInfo {
  recipeName: string
  cheapest: StorePricing | null
  byStore: StorePricing[]
  allStores: string[]
  totalIngredients: number
  cachedIngredients: number
  isComplete: boolean
}

/**
 * Calculate the cheapest cost to make a recipe
 * Queries the ingredient_cache to get non-expired prices
 * Returns cost per store and identifies cheapest overall
 */
export async function getRecipePricingInfo(recipeId: string): Promise<RecipePricingInfo | null> {
  try {
    const client = createServerClient()

    // First, get the recipe details
    const { data: recipe, error: recipeError } = await client
      .from("recipes")
      .select("title, ingredients")
      .eq("id", recipeId)
      .single()

    if (recipeError || !recipe) {
      console.error("Error fetching recipe:", recipeError)
      return null
    }

    // Get all ingredient mappings for this recipe
    const { data: ingredientMappings, error: mappingError } = await client
      .from("ingredient_mappings")
      .select("id, original_name, standardized_ingredient_id")
      .eq("recipe_id", recipeId)

    if (mappingError) {
      console.error("Error fetching ingredient mappings:", mappingError)
      return null
    }

    if (!ingredientMappings || ingredientMappings.length === 0) {
      // No mappings found, recipe hasn't been standardized yet
      return {
        recipeName: recipe.title,
        cheapest: null,
        byStore: [],
        allStores: [],
        totalIngredients: 0,
        cachedIngredients: 0,
        isComplete: false,
      }
    }

    const totalIngredients = ingredientMappings.length

    const ingredientIds = ingredientMappings.map((m) => m.standardized_ingredient_id)

    // Get all non-expired cache entries for these ingredients
    const { data: cachedPrices, error: priceError } = await client
      .from("ingredient_cache")
      .select("standardized_ingredient_id, store, price, quantity, unit")
      .in("standardized_ingredient_id", ingredientIds)
      .gt("expires_at", new Date().toISOString())

    if (priceError) {
      console.error("Error fetching ingredient prices:", priceError)
      return null
    }

    if (!cachedPrices || cachedPrices.length === 0) {
      // No prices cached yet
      return {
        recipeName: recipe.title,
        cheapest: null,
        byStore: [],
        allStores: [],
        totalIngredients,
        cachedIngredients: 0,
        isComplete: false,
      }
    }

    // Map standardized ingredient IDs to their original recipe names
    const ingredientNameMap = new Map(
      ingredientMappings.map((m) => [m.standardized_ingredient_id, m.original_name])
    )

    // Group prices by store
    const pricesByStore = new Map<string, Array<(typeof cachedPrices)[0]>>()

    for (const price of cachedPrices) {
      if (!pricesByStore.has(price.store)) {
        pricesByStore.set(price.store, [])
      }
      pricesByStore.get(price.store)!.push(price)
    }

    // Calculate totals per store
    const storePricings: StorePricing[] = []

    for (const [store, items] of pricesByStore.entries()) {
      let storeTotal = 0
      const storeItems: StorePricing["items"] = []

      for (const item of items) {
        const ingredientName = ingredientNameMap.get(item.standardized_ingredient_id) || "Unknown"
        storeTotal += item.price
        storeItems.push({
          ingredient: ingredientName,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
        })
      }

      storePricings.push({
        store,
        total: Number(storeTotal.toFixed(2)),
        items: storeItems,
      })
    }

    // Sort by total price
    storePricings.sort((a, b) => a.total - b.total)

    // Count unique ingredients that have cached prices (across all stores)
    const uniqueCachedIngredients = new Set(
      cachedPrices.map((p) => p.standardized_ingredient_id)
    ).size

    // Check if the cheapest store has all ingredients
    const isComplete = storePricings.length > 0 &&
      storePricings[0].items.length === totalIngredients

    return {
      recipeName: recipe.title,
      cheapest: storePricings.length > 0 ? storePricings[0] : null,
      byStore: storePricings,
      allStores: Array.from(pricesByStore.keys()),
      totalIngredients,
      cachedIngredients: uniqueCachedIngredients,
      isComplete,
    }
  } catch (error) {
    console.error("Error in getRecipePricingInfo:", error)
    return null
  }
}

/**
 * Get pricing for multiple recipes at once
 */
export async function getRecipesPricingInfo(recipeIds: string[]): Promise<Map<string, RecipePricingInfo>> {
  const results = new Map<string, RecipePricingInfo>()

  for (const recipeId of recipeIds) {
    const pricing = await getRecipePricingInfo(recipeId)
    if (pricing) {
      results.set(recipeId, pricing)
    }
  }

  return results
}

/**
 * Get a simple cheapest price for a recipe (just the number)
 */
export async function getRecipeCheapestPrice(recipeId: string): Promise<number | null> {
  const pricing = await getRecipePricingInfo(recipeId)
  return pricing?.cheapest?.total || null
}

/**
 * Check if recipe pricing is available (all ingredients have prices)
 */
export async function isRecipePricingAvailable(recipeId: string): Promise<boolean> {
  try {
    const client = createServerClient()

    const { data: mappings, error: mappingError } = await client
      .from("ingredient_mappings")
      .select("standardized_ingredient_id")
      .eq("recipe_id", recipeId)

    if (mappingError || !mappings || mappings.length === 0) {
      return false
    }

    const ingredientIds = mappings.map((m) => m.standardized_ingredient_id)

    // Check if all ingredients have cached prices
    const { count, error: countError } = await client
      .from("ingredient_cache")
      .select("*", { count: "exact", head: true })
      .in("standardized_ingredient_id", ingredientIds)
      .gt("expires_at", new Date().toISOString())

    if (countError) {
      console.error("Error checking recipe pricing availability:", countError)
      return false
    }

    return (count || 0) >= ingredientIds.length
  } catch (error) {
    console.error("Error in isRecipePricingAvailable:", error)
    return false
  }
}