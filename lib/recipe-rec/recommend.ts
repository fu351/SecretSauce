import type { RecommendationConfig, ScoredRecipe, SubstitutionLookup } from './types'
import { DEFAULT_WEIGHTS, DEFAULT_FILTERS, DEFAULT_LIMIT, PANTRY_STAPLES } from './constants'
import { loadPantrySnapshot, loadCandidateRecipes, loadUserPreferences, loadUserHistory, loadEmbeddingSubstitutions } from './data-loader'
import { scoreRecipe } from './scorer'

/**
 * Main recommendation orchestrator.
 * Loads data in parallel, scores all candidates, filters and sorts.
 */
export async function getRecommendations(
  config: Partial<RecommendationConfig> & { userId: string }
): Promise<ScoredRecipe[]> {
  const fullConfig: RecommendationConfig = {
    userId: config.userId,
    weights: config.weights ?? DEFAULT_WEIGHTS,
    filters: { ...DEFAULT_FILTERS, ...config.filters },
    limit: config.limit ?? DEFAULT_LIMIT,
  }

  // Load all data in parallel
  const [pantry, candidates, prefs, history] = await Promise.all([
    loadPantrySnapshot(fullConfig.userId),
    loadCandidateRecipes(fullConfig.userId, fullConfig.filters),
    loadUserPreferences(fullConfig.userId),
    loadUserHistory(fullConfig.userId, 7),
  ])

  if (candidates.length === 0) return []

  // Collect all missing non-staple ingredient IDs across all candidates
  const missingIds = new Set<string>()
  for (const candidate of candidates) {
    for (const ing of candidate.requiredIngredients) {
      if (
        !pantry.ingredientIds.has(ing.standardizedIngredientId) &&
        !PANTRY_STAPLES.has(ing.canonicalName.toLowerCase())
      ) {
        missingIds.add(ing.standardizedIngredientId)
      }
    }
  }

  // Load embedding-based substitutions in one RPC call
  const embeddingSubs = await loadEmbeddingSubstitutions(
    Array.from(missingIds),
    Array.from(pantry.ingredientIds),
  )

  const substitutions: SubstitutionLookup = { embeddingSubs }

  // Score every candidate with both static + embedding substitution data
  const scored = candidates.map(candidate =>
    scoreRecipe(candidate, pantry, prefs, history, fullConfig, substitutions)
  )

  // Filter by minimum match ratio
  const minMatch = fullConfig.filters.minMatchRatio ?? 0.4
  const filtered = scored.filter(s => s.ingredientMatchRatio >= minMatch)

  // Sort descending by total score
  filtered.sort((a, b) => b.totalScore - a.totalScore)

  // Return top N
  return filtered.slice(0, fullConfig.limit)
}
