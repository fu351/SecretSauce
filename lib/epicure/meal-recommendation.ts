import type { SwapSuggestion } from "./types"

/**
 * Epicure-driven meal recommendation scoring (pure, no I/O).
 *
 * Given seed ingredients (a chosen recipe, the pantry, or an explicit list) and
 * their flavour/chemistry neighbours, build an affinity map and rank candidate
 * recipes by how well their ingredients align with it. An optional target
 * cuisine nudges matching recipes up the list.
 */

export interface RecipeCandidate {
  id: string
  title: string
  /** Standardized/Epicure-style ingredient tokens for the recipe. */
  ingredientTokens: string[]
  cuisine?: string | null
}

export interface ScoredRecipe extends RecipeCandidate {
  matchScore: number
  matchedTokens: string[]
}

export interface RankOptions {
  cuisine?: string
  limit?: number
}

/** Score awarded to a seed ingredient itself (max possible per-token affinity). */
export const SEED_BOOST = 1
/** Additive bonus applied when a recipe's cuisine matches the requested cuisine. */
export const CUISINE_BONUS = 0.1

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
 * Merge seed ingredients and their neighbour lists into a token -> affinity map.
 * Seeds get {@link SEED_BOOST}; neighbours contribute their similarity score.
 * When a token appears multiple times the highest score wins.
 */
export function buildAffinity(
  seeds: string[],
  neighborLists: SwapSuggestion[][]
): Map<string, number> {
  const affinity = new Map<string, number>()

  const bump = (token: string, score: number) => {
    if (!token) return
    const existing = affinity.get(token)
    if (existing === undefined || score > existing) {
      affinity.set(token, score)
    }
  }

  for (const seed of seeds) bump(toToken(seed), SEED_BOOST)
  for (const list of neighborLists) {
    for (const suggestion of list) {
      bump(suggestion.token || toToken(suggestion.ingredient), suggestion.score)
    }
  }
  return affinity
}

/** Score a single recipe: summed affinity of matched tokens, normalized by recipe size. */
export function scoreRecipe(
  recipe: RecipeCandidate,
  affinity: Map<string, number>
): { score: number; matchedTokens: string[] } {
  const matchedTokens: string[] = []
  let total = 0
  for (const token of recipe.ingredientTokens) {
    const value = affinity.get(token)
    if (value !== undefined) {
      total += value
      matchedTokens.push(token)
    }
  }
  const size = Math.max(recipe.ingredientTokens.length, 1)
  return { score: total / size, matchedTokens }
}

/** Rank candidate recipes by affinity, drop non-matching recipes, apply cuisine bonus + limit. */
export function rankRecipes(
  recipes: RecipeCandidate[],
  affinity: Map<string, number>,
  options: RankOptions = {}
): ScoredRecipe[] {
  const targetCuisine = options.cuisine ? toToken(options.cuisine) : null

  const scored: ScoredRecipe[] = []
  for (const recipe of recipes) {
    const { score, matchedTokens } = scoreRecipe(recipe, affinity)
    if (score <= 0) continue
    const cuisineBonus =
      targetCuisine && recipe.cuisine && toToken(recipe.cuisine) === targetCuisine ? CUISINE_BONUS : 0
    scored.push({ ...recipe, matchScore: score + cuisineBonus, matchedTokens })
  }

  scored.sort((a, b) => b.matchScore - a.matchScore)
  return options.limit !== undefined ? scored.slice(0, options.limit) : scored
}
