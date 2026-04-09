import type { HeuristicWeights, RecipeFilters } from './types'

/**
 * Common pantry staples that most kitchens have.
 * Missing staples are penalised at 20% of normal missing-ingredient penalty.
 */
export const PANTRY_STAPLES = new Set([
  'salt',
  'black pepper',
  'pepper',
  'water',
  'cooking oil',
  'vegetable oil',
  'olive oil',
  'sugar',
  'all-purpose flour',
  'flour',
  'butter',
  'garlic',
  'onion',
  'baking soda',
  'baking powder',
  'vanilla extract',
  'soy sauce',
  'vinegar',
  'rice',
  'eggs',
  'milk',
])

export interface SubstitutionEntry {
  substitute: string
  confidence: number
}

/**
 * Bidirectional substitution pairs with confidence scores.
 * Both directions are stored for O(1) lookup.
 */
export const SUBSTITUTION_MAP: Record<string, SubstitutionEntry[]> = {
  // Citrus
  'lemon': [{ substitute: 'lime', confidence: 0.9 }],
  'lime': [{ substitute: 'lemon', confidence: 0.9 }],
  'lemon juice': [{ substitute: 'lime juice', confidence: 0.9 }],
  'lime juice': [{ substitute: 'lemon juice', confidence: 0.9 }],

  // Dairy fats
  'butter': [
    { substitute: 'margarine', confidence: 0.85 },
    { substitute: 'coconut oil', confidence: 0.7 },
  ],
  'margarine': [{ substitute: 'butter', confidence: 0.85 }],

  // Cream
  'heavy cream': [
    { substitute: 'coconut cream', confidence: 0.7 },
    { substitute: 'half and half', confidence: 0.75 },
  ],
  'coconut cream': [{ substitute: 'heavy cream', confidence: 0.7 }],
  'half and half': [{ substitute: 'heavy cream', confidence: 0.75 }],

  // Milk
  'milk': [
    { substitute: 'oat milk', confidence: 0.8 },
    { substitute: 'almond milk', confidence: 0.75 },
  ],
  'oat milk': [{ substitute: 'milk', confidence: 0.8 }],
  'almond milk': [{ substitute: 'milk', confidence: 0.75 }],

  // Sweeteners
  'sugar': [
    { substitute: 'honey', confidence: 0.8 },
    { substitute: 'maple syrup', confidence: 0.75 },
  ],
  'honey': [{ substitute: 'sugar', confidence: 0.8 }, { substitute: 'maple syrup', confidence: 0.85 }],
  'maple syrup': [{ substitute: 'honey', confidence: 0.85 }],

  // Vinegar
  'white vinegar': [{ substitute: 'apple cider vinegar', confidence: 0.85 }],
  'apple cider vinegar': [{ substitute: 'white vinegar', confidence: 0.85 }],
  'rice vinegar': [{ substitute: 'white vinegar', confidence: 0.7 }],

  // Oils
  'vegetable oil': [{ substitute: 'canola oil', confidence: 0.95 }, { substitute: 'olive oil', confidence: 0.8 }],
  'canola oil': [{ substitute: 'vegetable oil', confidence: 0.95 }],
  'olive oil': [{ substitute: 'vegetable oil', confidence: 0.8 }],

  // Herbs
  'fresh basil': [{ substitute: 'dried basil', confidence: 0.7 }],
  'dried basil': [{ substitute: 'fresh basil', confidence: 0.7 }],
  'fresh parsley': [{ substitute: 'dried parsley', confidence: 0.65 }],
  'dried parsley': [{ substitute: 'fresh parsley', confidence: 0.65 }],
  'fresh cilantro': [{ substitute: 'fresh parsley', confidence: 0.6 }],

  // Protein
  'chicken breast': [{ substitute: 'chicken thigh', confidence: 0.9 }],
  'chicken thigh': [{ substitute: 'chicken breast', confidence: 0.9 }],

  // Starch
  'bread crumbs': [{ substitute: 'panko', confidence: 0.9 }],
  'panko': [{ substitute: 'bread crumbs', confidence: 0.9 }],

  // Cheese
  'parmesan': [{ substitute: 'pecorino romano', confidence: 0.85 }],
  'pecorino romano': [{ substitute: 'parmesan', confidence: 0.85 }],

  // Sauces
  'soy sauce': [{ substitute: 'tamari', confidence: 0.9 }, { substitute: 'coconut aminos', confidence: 0.7 }],
  'tamari': [{ substitute: 'soy sauce', confidence: 0.9 }],
  'coconut aminos': [{ substitute: 'soy sauce', confidence: 0.7 }],
}

export const DEFAULT_WEIGHTS: HeuristicWeights = {
  ingredientMatch: 0.40,
  quantitySufficiency: 0.10,
  expiryUrgency: 0.10,
  pantryStaple: 0.05,
  substitution: 0.10,
  preference: 0.10,
  popularity: 0.05,
  diversity: 0.10,
}

export const DEFAULT_FILTERS: RecipeFilters = {
  minMatchRatio: 0.4,
}

export const DEFAULT_LIMIT = 20

/** Staple penalty factor — missing staples count as 20% of a normal missing ingredient */
export const STAPLE_PENALTY_FACTOR = 0.2

/** Substitution credit factor — substitutable ingredients get 80% of match credit */
export const SUBSTITUTION_CREDIT_FACTOR = 0.8
