import type { DietaryTag, CuisineType, MealTypeTag } from '@/lib/types/recipe/tags'

export interface RecipeCandidate {
  recipeId: string
  title: string
  cuisine: string | null
  mealType: string | null
  difficulty: string | null
  prepTime: number | null
  cookTime: number | null
  tags: string[]
  ratingAvg: number | null
  ratingCount: number | null
  requiredIngredients: CandidateIngredient[]
  optionalIngredients: CandidateIngredient[]
}

export interface CandidateIngredient {
  standardizedIngredientId: string
  canonicalName: string
  category: string
  quantity: number | null
  unit: string | null
  displayName: string
}

export interface PantrySnapshot {
  items: PantryItem[]
  ingredientIds: Set<string>
  itemsByIngredientId: Map<string, PantryItem>
  expiringWithin7Days: Set<string>
}

export interface PantryItem {
  standardizedIngredientId: string
  name: string
  quantity: number | null
  unit: string | null
  category: string
  expiryDate: string | null
}

export interface ScoredRecipe {
  recipeId: string
  title: string
  totalScore: number
  ingredientMatchRatio: number
  matchedIngredients: string[]
  missingIngredients: string[]
  missingButSubstitutable: string[]
  expiryBoost: number
  signals: ScoreBreakdown
}

export interface ScoreBreakdown {
  ingredientMatch: number
  quantitySufficiency: number
  expiryUrgency: number
  pantryStapleAdjustment: number
  substitutionCredit: number
  preferenceAlignment: number
  popularityBoost: number
  diversityPenalty: number
}

export interface RecommendationConfig {
  weights: HeuristicWeights
  filters: RecipeFilters
  limit: number
  userId: string
}

export interface HeuristicWeights {
  ingredientMatch: number
  quantitySufficiency: number
  expiryUrgency: number
  pantryStaple: number
  substitution: number
  preference: number
  popularity: number
  diversity: number
}

export interface RecipeFilters {
  cuisines?: CuisineType[]
  mealTypes?: MealTypeTag[]
  maxPrepMinutes?: number
  maxDifficulty?: string
  dietaryTags?: DietaryTag[]
  minMatchRatio?: number
}

export interface UserPreferences {
  dietaryPreferences: string[]
  cuisinePreferences: string[]
  cookingTimePreference: string | null
  budgetRange: string | null
}

export interface UserHistory {
  recentRecipeIds: Set<string>
  recentCuisines: string[]
  recentCuisineCounts: Map<string, number>
  favoriteRecipeIds: Set<string>
}

export interface EmbeddingSubstitution {
  substituteName: string
  similarity: number
}

/**
 * Combined substitution data passed to the scorer.
 * The scorer checks the static map first (instant), then falls back to
 * embedding-based substitutions (loaded from DB by the orchestrator).
 */
export interface SubstitutionLookup {
  /** Embedding-based subs keyed by missing ingredient's standardizedIngredientId */
  embeddingSubs: Map<string, EmbeddingSubstitution>
}
