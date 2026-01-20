import { BaseTable } from "./database/base-db"


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
  const now = new Date().toISOString();

  // OPTIMAL: Use the static BaseTable accessor to perform a deep relational join
  const { data: recipe, error } = await BaseTable.from("recipes")
    .select(`
      title,
      mappings:ingredient_mappings (
        original_name,
        standardized_ingredient_id,
        prices:ingredient_cache (
          store,
          price,
          quantity,
          unit
        )
      )
    `)
    .eq("id", recipeId)
    .gt("ingredient_mappings.ingredient_cache.expires_at", now) // Filter valid prices
    .is("deleted_at", null) // Filter soft-deleted recipes
    .single();

  if (error || !recipe) {
    console.error("[Pricing Service] Error fetching unified data:", error);
    return null;
  }

  // 3. Process the nested data in a single O(N) pass
  const mappings = (recipe.mappings as any[]) || [];
  const storeMap = new Map<string, StorePricing>();
  const uniqueCachedIds = new Set<string>();

  for (const mapping of mappings) {
    const prices = mapping.prices || [];
    if (prices.length > 0) {
      uniqueCachedIds.add(mapping.standardized_ingredient_id);

      for (const p of prices) {
        if (!storeMap.has(p.store)) {
          storeMap.set(p.store, { store: p.store, total: 0, items: [] });
        }
        
        const store = storeMap.get(p.store)!;
        store.total += p.price;
        store.items.push({
          ingredient: mapping.original_name || "Unknown",
          price: p.price,
          quantity: p.quantity,
          unit: p.unit,
        });
      }
    }
  }

  // 4. Aggregate totals and identify cheapest
  const byStore = Array.from(storeMap.values())
    .map(s => ({ ...s, total: Number(s.total.toFixed(2)) }))
    .sort((a, b) => a.total - b.total);

  return {
    recipeName: recipe.title,
    cheapest: byStore[0] || null,
    byStore,
    allStores: byStore.map(s => s.store),
    totalIngredients: mappings.length,
    cachedIngredients: uniqueCachedIds.size,
    isComplete: byStore[0]?.items.length === mappings.length
  };
}
/**
 * REFACTORED: Batch Recipe Pricing
 * Uses BaseTable.from to fetch a nested data tree for multiple recipes in one trip.
 */
export async function getRecipesPricingInfo(recipeIds: string[]): Promise<Map<string, RecipePricingInfo>> {
  const results = new Map<string, RecipePricingInfo>();
  if (!recipeIds || recipeIds.length === 0) return results;

  try {
    const now = new Date().toISOString();

    // 1. SINGLE BATCH JOIN: The Infrastructure Gold Standard
    // We fetch the entire tree: Recipe -> Mappings -> Prices
    const { data: recipes, error } = await BaseTable.from("recipes")
      .select(`
        id,
        title,
        mappings:ingredient_mappings (
          original_name,
          standardized_ingredient_id,
          prices:ingredient_cache (
            store,
            price,
            quantity,
            unit
          )
        )
      `)
      .in("id", recipeIds)
      .gt("ingredient_mappings.ingredient_cache.expires_at", now) // Server-side filter
      .is("deleted_at", null);

    if (error || !recipes) {
      console.error("[Pricing Service] Batch fetch error:", error);
      return results;
    }

    // 2. PROCESS RESULTS
    // Because the data is already nested, we just iterate and transform
    for (const recipe of recipes) {
      const mappings = (recipe.mappings as any[]) || [];
      const storeMap = new Map<string, StorePricing>();
      const uniqueCachedIds = new Set<string>();

      // Group prices by store for this specific recipe
      for (const mapping of mappings) {
        const prices = mapping.prices || [];
        if (prices.length > 0) {
          uniqueCachedIds.add(mapping.standardized_ingredient_id);
          
          for (const p of prices) {
            if (!storeMap.has(p.store)) {
              storeMap.set(p.store, { store: p.store, total: 0, items: [] });
            }
            const store = storeMap.get(p.store)!;
            store.total += p.price;
            store.items.push({
              ingredient: mapping.original_name || "Unknown",
              price: p.price,
              quantity: p.quantity,
              unit: p.unit,
            });
          }
        }
      }

      const byStore = Array.from(storeMap.values())
        .map(s => ({ ...s, total: Number(s.total.toFixed(2)) }))
        .sort((a, b) => a.total - b.total);

      results.set(recipe.id, {
        recipeName: recipe.title,
        cheapest: byStore[0] || null,
        byStore,
        allStores: byStore.map(s => s.store),
        totalIngredients: mappings.length,
        cachedIngredients: uniqueCachedIds.size,
        isComplete: byStore[0]?.items.length === mappings.length,
      });
    }

    return results;
  } catch (error) {
    console.error("Fatal error in getRecipesPricingInfo:", error);
    return results;
  }
}
/**
 * Get a simple cheapest price for a recipe (just the number)
 */
export async function getRecipeCheapestPrice(recipeId: string): Promise<number | null> {
  const pricing = await getRecipePricingInfo(recipeId)
  return pricing?.cheapest?.total || null
}

/**
 * REFACTORED: Check pricing availability
 * Uses BaseTable.from to perform a single-trip relational check.
 */
export async function isRecipePricingAvailable(recipeId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // SINGLE TRIP: Join mappings and prices
    const { data: mappings, error } = await BaseTable.from("ingredient_mappings")
      .select(`
        standardized_ingredient_id,
        prices:ingredient_cache (
          id
        )
      `)
      .eq("id", recipeId)
      .gt("ingredient_cache.expires_at", now);

    if (error || !mappings || mappings.length === 0) {
      return false;
    }

    // A recipe is available only if EVERY mapping has at least one price
    // This is more accurate than just comparing total counts
    return mappings.every(m => (m.prices as any[]).length > 0);
    
  } catch (error) {
    console.error("[Pricing Service] Error checking availability:", error);
    return false;
  }
}