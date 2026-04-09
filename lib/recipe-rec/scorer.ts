import type {
  RecipeCandidate,
  CandidateIngredient,
  PantrySnapshot,
  UserPreferences,
  UserHistory,
  RecommendationConfig,
  ScoredRecipe,
  ScoreBreakdown,
  SubstitutionLookup,
} from './types'
import {
  PANTRY_STAPLES,
  SUBSTITUTION_MAP,
  STAPLE_PENALTY_FACTOR,
  SUBSTITUTION_CREDIT_FACTOR,
} from './constants'

/**
 * Score a single recipe candidate against the user's pantry, preferences, and history.
 * Pure function — no side effects or DB calls.
 *
 * @param substitutions — optional embedding-based substitution data. When provided,
 *   missing ingredients not found in the static SUBSTITUTION_MAP are checked against
 *   embedding similarity results. Pass undefined to use static map only.
 */
export function scoreRecipe(
  candidate: RecipeCandidate,
  pantry: PantrySnapshot,
  prefs: UserPreferences,
  history: UserHistory,
  config: RecommendationConfig,
  substitutions?: SubstitutionLookup,
): ScoredRecipe {
  const { weights } = config
  const allIngredients = candidate.requiredIngredients

  if (allIngredients.length === 0) {
    return emptyScore(candidate)
  }

  // Deduplicate ingredients by standardizedIngredientId to avoid double-counting
  const seen = new Set<string>()
  const uniqueIngredients: CandidateIngredient[] = []
  for (const ing of allIngredients) {
    if (!seen.has(ing.standardizedIngredientId)) {
      seen.add(ing.standardizedIngredientId)
      uniqueIngredients.push(ing)
    }
  }

  // Classify ingredients
  const matched: string[] = []
  const missing: string[] = []
  const missingButSubstitutable: string[] = []

  // Map from ingredient ID → ingredient for missing items (avoids name collisions)
  const missingIngredientsById = new Map<string, CandidateIngredient>()

  for (const ing of uniqueIngredients) {
    if (pantry.ingredientIds.has(ing.standardizedIngredientId)) {
      matched.push(ing.canonicalName)
    } else {
      missing.push(ing.canonicalName)
      missingIngredientsById.set(ing.standardizedIngredientId, ing)
    }
  }

  // 1. Ingredient match ratio
  const ingredientMatchRatio = matched.length / uniqueIngredients.length
  const ingredientMatchScore = ingredientMatchRatio

  // 2. Quantity sufficiency — uses Map for O(1) lookup
  const quantitySufficiency = computeQuantitySufficiency(uniqueIngredients, pantry)

  // 3. Expiry urgency — boost if recipe uses expiring ingredients (deduplicated)
  const expiringUsed = uniqueIngredients.filter(
    ing => pantry.expiringWithin7Days.has(ing.standardizedIngredientId)
  ).length
  const expiryUrgency = pantry.expiringWithin7Days.size > 0
    ? expiringUsed / pantry.expiringWithin7Days.size
    : 0

  // 4. Pantry staple adjustment — reduce penalty for missing staples
  let stapleAdjustment = 0
  const nonStapleMissingIds: string[] = []
  for (const [id, ing] of missingIngredientsById) {
    if (PANTRY_STAPLES.has(ing.canonicalName.toLowerCase())) {
      stapleAdjustment += (1 - STAPLE_PENALTY_FACTOR) / uniqueIngredients.length
    } else {
      nonStapleMissingIds.push(id)
    }
  }

  // 5. Substitution credit — check static map first, then embedding-based fallback
  let substitutionCredit = 0

  for (const id of nonStapleMissingIds) {
    const ing = missingIngredientsById.get(id)!
    const name = ing.canonicalName

    // --- Static map check (instant, curated pairs) ---
    const subs = SUBSTITUTION_MAP[name.toLowerCase()]
    if (subs) {
      const matchingSubs = subs.filter(s =>
        pantry.items.some(pi => pi.name.toLowerCase() === s.substitute.toLowerCase())
      )
      if (matchingSubs.length > 0) {
        const bestConfidence = Math.max(...matchingSubs.map(s => s.confidence))
        substitutionCredit += (bestConfidence * SUBSTITUTION_CREDIT_FACTOR) / uniqueIngredients.length
        missingButSubstitutable.push(name)
        continue
      }
    }

    // --- Embedding-based fallback ---
    if (substitutions?.embeddingSubs) {
      const embSub = substitutions.embeddingSubs.get(id)
      if (embSub) {
        substitutionCredit += (embSub.similarity * SUBSTITUTION_CREDIT_FACTOR) / uniqueIngredients.length
        missingButSubstitutable.push(name)
      }
    }
  }

  // 6. Preference alignment
  const preferenceScore = computePreferenceAlignment(candidate, prefs)

  // 7. Popularity boost — rating_avg * log(rating_count + 1), normalised
  const popularityScore = computePopularity(candidate)

  // 8. Diversity penalty — penalise recently-cooked recipes or cuisines
  const diversityPenalty = computeDiversityPenalty(candidate, history)

  // Build breakdown
  const signals: ScoreBreakdown = {
    ingredientMatch: ingredientMatchScore,
    quantitySufficiency,
    expiryUrgency,
    pantryStapleAdjustment: stapleAdjustment,
    substitutionCredit,
    preferenceAlignment: preferenceScore,
    popularityBoost: popularityScore,
    diversityPenalty,
  }

  // Weighted sum
  const totalScore = Math.min(100, Math.max(0,
    (
      weights.ingredientMatch * signals.ingredientMatch +
      weights.quantitySufficiency * signals.quantitySufficiency +
      weights.expiryUrgency * signals.expiryUrgency +
      weights.pantryStaple * signals.pantryStapleAdjustment +
      weights.substitution * signals.substitutionCredit +
      weights.preference * signals.preferenceAlignment +
      weights.popularity * signals.popularityBoost +
      weights.diversity * (1 - signals.diversityPenalty)
    ) * 100
  ))

  return {
    recipeId: candidate.recipeId,
    title: candidate.title,
    totalScore,
    ingredientMatchRatio,
    matchedIngredients: matched,
    missingIngredients: missing.filter(m => !missingButSubstitutable.includes(m)),
    missingButSubstitutable,
    expiryBoost: expiryUrgency,
    signals,
  }
}

function computeQuantitySufficiency(
  ingredients: CandidateIngredient[],
  pantry: PantrySnapshot
): number {
  let total = 0
  let count = 0

  for (const ing of ingredients) {
    if (!pantry.ingredientIds.has(ing.standardizedIngredientId)) continue
    count++

    // O(1) lookup via Map instead of O(n) .find()
    const pantryItem = pantry.itemsByIngredientId?.get(ing.standardizedIngredientId)

    if (!pantryItem || ing.quantity == null || pantryItem.quantity == null) {
      total += 0.5
      continue
    }

    if (ing.unit === pantryItem.unit || (!ing.unit && !pantryItem.unit)) {
      total += pantryItem.quantity >= ing.quantity ? 1.0 : 0.5
    } else {
      total += 0.5
    }
  }

  return count > 0 ? total / count : 0
}

function computePreferenceAlignment(
  candidate: RecipeCandidate,
  prefs: UserPreferences
): number {
  let score = 0.5 // neutral baseline

  if (candidate.cuisine && prefs.cuisinePreferences.length > 0) {
    const cuisineLower = candidate.cuisine.toLowerCase()
    if (prefs.cuisinePreferences.some(c => c.toLowerCase() === cuisineLower)) {
      score += 0.3
    }
  }

  if (prefs.dietaryPreferences.length > 0) {
    const recipeTags = new Set(candidate.tags.map(t => t.toLowerCase()))

    for (const pref of prefs.dietaryPreferences) {
      const prefLower = pref.toLowerCase()
      if (['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'paleo'].includes(prefLower)) {
        if (!recipeTags.has(prefLower)) {
          score -= 0.15
        } else {
          score += 0.1
        }
      }
    }
  }

  if (prefs.cookingTimePreference && candidate.prepTime != null) {
    const totalTime = (candidate.prepTime ?? 0) + (candidate.cookTime ?? 0)
    const pref = prefs.cookingTimePreference.toLowerCase()
    if (pref === 'quick' && totalTime <= 30) score += 0.1
    else if (pref === 'moderate' && totalTime <= 60) score += 0.05
    else if (pref === 'quick' && totalTime > 45) score -= 0.1
  }

  return Math.max(0, Math.min(1, score))
}

function computePopularity(candidate: RecipeCandidate): number {
  if (candidate.ratingAvg == null || candidate.ratingCount == null) return 0.5

  // Clamp to valid range in case of data corruption
  const ratingAvg = Math.max(1, Math.min(5, candidate.ratingAvg))
  const ratingCount = Math.max(0, candidate.ratingCount)

  const normRating = (ratingAvg - 1) / 4
  const countFactor = Math.min(1, Math.log(ratingCount + 1) / Math.log(100))

  return normRating * 0.7 + countFactor * 0.3
}

function computeDiversityPenalty(
  candidate: RecipeCandidate,
  history: UserHistory
): number {
  let penalty = 0

  if (history.recentRecipeIds.has(candidate.recipeId)) {
    penalty += 0.6
  }

  // Use pre-built cuisine count Map for O(1) lookup when available,
  // fall back to linear scan for backward compatibility with tests
  if (candidate.cuisine) {
    const cuisineLower = candidate.cuisine.toLowerCase()
    if (history.recentCuisineCounts) {
      const count = history.recentCuisineCounts.get(cuisineLower) ?? 0
      penalty += Math.min(0.3, count * 0.1)
    } else if (history.recentCuisines.length > 0) {
      const count = history.recentCuisines.filter(
        c => c.toLowerCase() === cuisineLower
      ).length
      penalty += Math.min(0.3, count * 0.1)
    }
  }

  if (history.favoriteRecipeIds.has(candidate.recipeId)) {
    penalty -= 0.15
  }

  return Math.max(0, Math.min(1, penalty))
}

function emptyScore(candidate: RecipeCandidate): ScoredRecipe {
  return {
    recipeId: candidate.recipeId,
    title: candidate.title,
    totalScore: 0,
    ingredientMatchRatio: 0,
    matchedIngredients: [],
    missingIngredients: [],
    missingButSubstitutable: [],
    expiryBoost: 0,
    signals: {
      ingredientMatch: 0,
      quantitySufficiency: 0,
      expiryUrgency: 0,
      pantryStapleAdjustment: 0,
      substitutionCredit: 0,
      preferenceAlignment: 0,
      popularityBoost: 0,
      diversityPenalty: 0,
    },
  }
}
