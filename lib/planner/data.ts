import { createServerClient } from "@/lib/supabase"
import {
  resolveOrCreateStandardizedId,
  getOrRefreshIngredientPrice,
} from "@/lib/ingredient-pipeline"
import type {
  PantryItem,
  Recipe,
  RecipeIngredient,
  Store,
  StoreItem,
  UserProfile,
} from "./types"

const FALLBACK_STORES: Store[] = [
  { id: "walmart", name: "Walmart" },
  { id: "target", name: "Target" },
  { id: "kroger", name: "Kroger" },
  { id: "aldi", name: "Aldi" },
  { id: "safeway", name: "Safeway" },
  { id: "traderjoes", name: "Trader Joe's" },
  { id: "meijer", name: "Meijer" },
  { id: "wholefoods", name: "Whole Foods" },
]

const normalizeQuantity = (value: any) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

const normalizeIngredient = (raw: any): RecipeIngredient => {
  return {
    name: raw?.name || raw?.ingredient || "",
    amount: normalizeQuantity(raw?.amount ?? raw?.quantity ?? 1),
    unit: raw?.unit || raw?.measure || undefined,
    standardizedIngredientId: raw?.standardized_ingredient_id ?? null,
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const client = createServerClient()
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[planner] Failed to load profile", error)
    return null
  }

  if (!data) return null

  return {
    id: data.id,
    email: data.email,
    budgetRange: data.budget_range,
    dietaryPreferences: data.dietary_preferences,
    cuisinePreferences: data.cuisine_preferences,
    cookingTimePreference: data.cooking_time_preference,
    primaryGoal: data.primary_goal,
    groceryZip: data.postal_code,
    groceryDistanceMiles: data.grocery_distance_miles,
  }
}

export async function getUserPantry(userId: string): Promise<PantryItem[]> {
  const client = createServerClient()
  const { data, error } = await client
    .from("pantry_items")
    .select("id, name, quantity, unit, standardized_ingredient_id")
    .eq("user_id", userId)

  if (error) {
    console.error("[planner] Failed to load pantry", error)
    return []
  }

  return (data || []).map((item) => ({
    id: item.id,
    name: item.name,
    quantity: normalizeQuantity(item.quantity ?? 0),
    unit: item.unit,
    standardizedIngredientId: (item as any).standardized_ingredient_id ?? null,
  }))
}

export async function listCandidateStores(userId?: string): Promise<Store[]> {
  const client = createServerClient()
  try {
    const { data } = await client
      .from("store_locations_cache" as any)
      .select("store_canonical, postal_code")
      .limit(25)

    if (!data || data.length === 0) {
      return FALLBACK_STORES
    }

    const seen = new Set<string>()
    const stores: Store[] = []
    for (const row of data as Array<any>) {
      const id = (row.store_canonical || "").toLowerCase()
      if (!id || seen.has(id)) continue
      seen.add(id)
      stores.push({
        id,
        name: id.replace(/_/g, " "),
        zipCode: row.postal_code || null,
      })
    }
    return stores.length > 0 ? stores : FALLBACK_STORES
  } catch (error) {
    console.error("[planner] Failed to list candidate stores", error)
    return FALLBACK_STORES
  }
}

export async function getRecipeById(recipeId: string): Promise<Recipe | null> {
  const client = createServerClient()
  const { data, error } = await client
    .from("recipes")
    .select("*, dietary_flags, protein_tag, cuisine_guess")
    .eq("id", recipeId)
    .maybeSingle()

  if (error) {
    console.error("[planner] Failed to load recipe", error)
    return null
  }

  if (!data) return null

  const servings = data.servings ?? 1
  const ingredients = Array.isArray(data.ingredients) ? data.ingredients.map(normalizeIngredient) : []

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    servings: servings > 0 ? servings : 1,
    prepTimeMinutes: data.prep_time,
    cookTimeMinutes: data.cook_time,
    dietaryTags: data.dietary_tags,
    ingredients,
    nutrition: data.nutrition,
    dietaryFlags: (data as any).dietary_flags ?? null,
    proteinTag: (data as any).protein_tag ?? null,
    cuisine: data.cuisine ?? null,
    cuisineGuess: (data as any).cuisine_guess ?? null,
  }
}

export async function getRecipesByIds(recipeIds: string[]): Promise<Recipe[]> {
  if (recipeIds.length === 0) return []
  const client = createServerClient()
  const { data, error } = await client
    .from("recipes")
    .select("*, dietary_flags, protein_tag, cuisine_guess")
    .in("id", recipeIds)

  if (error) {
    console.error("[planner] Failed to load recipes batch", error)
    return []
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings ?? 1,
    prepTimeMinutes: row.prep_time,
    cookTimeMinutes: row.cook_time,
    dietaryTags: row.dietary_tags,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(normalizeIngredient) : [],
    nutrition: row.nutrition,
    dietaryFlags: (row as any).dietary_flags ?? null,
    proteinTag: (row as any).protein_tag ?? null,
    cuisine: row.cuisine ?? null,
    cuisineGuess: (row as any).cuisine_guess ?? null,
  }))
}

export async function getCheapestStoreItem(
  storeId: string,
  ingredient: { name: string; standardizedIngredientId?: string | null },
  options: { allowRealTimeScraping?: boolean } = {}
): Promise<StoreItem | null> {
  const client = createServerClient()
  const { allowRealTimeScraping = false } = options // Default to cache-only for speed

  try {
    const standardizedId =
      ingredient.standardizedIngredientId ||
      (await resolveOrCreateStandardizedId(client, ingredient.name))

    const cacheRow = await getOrRefreshIngredientPrice(client, standardizedId, storeId, {
      allowRealTimeScraping,
    })

    if (!cacheRow) return null

    return {
      storeId: cacheRow.store,
      standardizedIngredientId: standardizedId,
      name: cacheRow.product_name || ingredient.name,
      price: Number(cacheRow.price) || 0,
      quantity: Number(cacheRow.quantity) || 1,
      unit: cacheRow.unit || "unit",
      productId: cacheRow.product_id,
      productName: cacheRow.product_name,
    }
  } catch (error) {
    console.error("[planner] Failed to price ingredient", { ingredient: ingredient.name, storeId, error })
    return null
  }
}
