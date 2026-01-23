import { estimateIngredientCostsForStore } from "@/lib/ingredient-pipeline"
import { recipeDB } from "../database/recipe-db"
import { createServerClient } from "@/lib/database/supabase"
import type { PriceAwareRecipeHit, RecipeSearchFilters, Recipe, PantryItem } from "./types"
import { options } from "happy-dom/lib/PropertySymbol"

const perRunCostCache = new Map<string, number>()

const normalizeProteinTag = (ingredients: Recipe["ingredients"]): string | undefined => {
  const proteins = ["chicken", "beef", "pork", "tofu", "fish", "salmon", "turkey", "beans", "lentil", "egg"]
  const normalized = ingredients.map((i) => (i.name || "").toLowerCase())
  for (const protein of proteins) {
    if (normalized.some((name) => name.includes(protein))) {
      return protein
    }
  }
  return undefined
}

const keyForCache = (recipeId: string, storeId: string) => `${recipeId}::${storeId}`

const dietConflicts = (flags: Record<string, any> | null | undefined, dietType?: string) => {
  if (!dietType || !flags) return false
  const diet = dietType.toLowerCase()
  if (diet.includes("dairy") && flags.contains_dairy) return true
  if (diet.includes("gluten") && flags.contains_gluten) return true
  if ((diet.includes("nut") || diet.includes("peanut")) && flags.contains_nuts) return true
  if (diet.includes("shellfish") && flags.contains_shellfish) return true
  if (diet.includes("egg") && flags.contains_egg) return true
  if (diet.includes("soy") && flags.contains_soy) return true
  return false
}

const withinFilters = (recipe: Recipe, filters: RecipeSearchFilters) => {
  const time = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)
  if (filters.maxTimeMinutes && time > filters.maxTimeMinutes) return false
  if (filters.dietType) {
    if (dietConflicts(recipe.dietaryFlags, filters.dietType)) return false
    if (recipe.dietaryTags?.length) {
      const matches = recipe.dietaryTags.some((tag) => tag.toLowerCase().includes(filters.dietType!.toLowerCase()))
      if (!matches && !recipe.dietaryFlags) return false
    }
  }
  if (filters.excludedIngredients?.length) {
    const ingredients = recipe.ingredients.map((ing) => (ing.name || "").toLowerCase())
    const hasExcluded = filters.excludedIngredients.some((blocked) =>
      ingredients.some((ing) => ing.includes(blocked.toLowerCase()))
    )
    if (hasExcluded) return false
  }
  if (filters.avoidTags?.length && recipe.dietaryTags?.length) {
    const tags = recipe.dietaryTags.map((t) => t.toLowerCase())
    if (filters.avoidTags.some((tag) => tags.includes(tag.toLowerCase()))) return false
  }
  if (filters.likedTags?.length && recipe.dietaryTags?.length) {
    const tags = recipe.dietaryTags.map((t) => t.toLowerCase())
    const hasLike = filters.likedTags.some((tag) => tags.includes(tag.toLowerCase()))
    if (!hasLike && Math.random() > 0.5) return false
  }
  return true
}

const estimateCostPerServing = async (recipe: Recipe, storeId: string): Promise<number> => {
  const cacheKey = keyForCache(recipe.id, storeId)
  if (perRunCostCache.has(cacheKey)) {
    return perRunCostCache.get(cacheKey) || 0
  }

  const validIngredients = recipe.ingredients.filter((ing) => ing.name?.trim())
  const estimate = await estimateIngredientCostsForStore(
    createServerClient(),
    validIngredients.map((ing) => ({
      name: ing.name,
      quantity: ing.amount ?? 1,
      unit: ing.unit,
      recipeId: recipe.id,
      standardizedIngredientId: ing.standardizedIngredientId ?? null,
    })),
    storeId,
    { allowRealTimeScraping: false }
  )

  const cost = estimate?.total ?? 0
  const perServing = cost / (recipe.servings || 1)
  perRunCostCache.set(cacheKey, perServing)
  return perServing
}

const computePantryMatch = (recipe: Recipe, pantry: PantryItem[] = []) => {
  if (!pantry.length) return 0
  const pantryNames = new Set(pantry.map((p) => (p.name || "").toLowerCase()))
  const total = recipe.ingredients.length || 1
  const hits = recipe.ingredients.filter((ing) => pantryNames.has((ing.name || "").toLowerCase())).length
  return Number((hits / total).toFixed(2))
}

export async function searchPriceAwareRecipes(
  query: string,
  filters: RecipeSearchFilters,
  limit: number
): Promise<PriceAwareRecipeHit[]> {
  const client = createServerClient()
  const storeId = filters.requiredStoreId || "walmart"

  const recipes = await recipeDB.findAll({ limit: 20 })
  const filtered = recipes.filter((recipe) => withinFilters(recipe, filters)).slice(0, limit * 2)

  // Prefer recipes matching user's cuisine preferences
  const sortedByCuisine = filtered.sort((a, b) => {
    if (!filters.preferredCuisines?.length) return 0

    const aCuisine = a.cuisine || ''
    const bCuisine = b.cuisine || ''

    const aCuisineMatch = filters.preferredCuisines.some(
      (pref) => aCuisine.toLowerCase().includes(pref.toLowerCase())
    )
    const bCuisineMatch = filters.preferredCuisines.some(
      (pref) => bCuisine.toLowerCase().includes(pref.toLowerCase())
    )
    if (aCuisineMatch && !bCuisineMatch) return -1
    if (!aCuisineMatch && bCuisineMatch) return 1
    return 0
  })

  const hits: PriceAwareRecipeHit[] = []
  for (const recipe of sortedByCuisine.slice(0, limit)) {
    const estimatedCostPerServing = await estimateCostPerServing(recipe, storeId)
    if (filters.maxEstimatedCostPerServing && estimatedCostPerServing > filters.maxEstimatedCostPerServing) {
      continue
    }
    const timeMinutes = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)
    hits.push({
      recipeId: recipe.id,
      storeId,
      estimatedCostPerServing,
      timeMinutes,
      mainProteinTag: recipe.proteinTag || normalizeProteinTag(recipe.ingredients),
      nutrition: recipe.nutrition,
      pantryMatchScore: computePantryMatch(recipe, filters.pantryItems || []),
    })
  }

  return hits
}
