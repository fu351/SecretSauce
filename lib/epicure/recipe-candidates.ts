import { recipeDB } from "@/lib/database/recipe-db"
import type { RecipeCandidate } from "./meal-recommendation"

function toToken(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
}

/**
 * Map a Recipe (with its loaded ingredients) to a scoring candidate.
 * Prefers the standardized ingredient name; falls back to the display name.
 */
export function recipeToCandidate(recipe: any): RecipeCandidate {
  const ingredientTokens = (recipe.ingredients ?? [])
    .map((ing: any) => toToken(ing.standardizedName || ing.name || ""))
    .filter((token: string): token is string => token.length > 0)

  return {
    id: recipe.id,
    title: recipe.title,
    ingredientTokens,
    cuisine: recipe.cuisine_name ?? recipe.cuisine ?? undefined,
  }
}

/** Fetch a pool of candidate recipes (with ingredients) for affinity ranking. */
export async function fetchRecipeCandidates(options: {
  cuisine?: string
  limit?: number
}): Promise<RecipeCandidate[]> {
  const recipes = await recipeDB.fetchRecipes({
    cuisine: options.cuisine,
    limit: options.limit ?? 100,
  })
  return recipes.map(recipeToCandidate)
}
