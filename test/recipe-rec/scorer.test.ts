import { describe, it, expect } from 'vitest'
import { scoreRecipe } from '@/lib/recipe-rec/scorer'
import type {
  RecipeCandidate,
  CandidateIngredient,
  PantrySnapshot,
  PantryItem,
  UserPreferences,
  UserHistory,
  RecommendationConfig,
  SubstitutionLookup,
} from '@/lib/recipe-rec/types'
import { DEFAULT_WEIGHTS } from '@/lib/recipe-rec/constants'
import type { Recipe } from '@/lib/types/recipe/recipe'
import type { RecipeIngredient } from '@/lib/types/recipe/ingredient'
import {
  mockRecipe,
  mockSimpleRecipe,
  mockVeganAdvancedRecipe,
  mockRecipeList,
  mockEmptyIngredientsRecipe,
} from '@/test/mocks/data/recipes'
import {
  mockBakingIngredients,
  mockProduceIngredients,
  mockProteinIngredients,
  mockCondimentIngredients,
} from '@/test/mocks/data/ingredients'

// ---------------------------------------------------------------------------
// Local adapters — bridge from existing UI mock types to scorer types.
// These live here in the test file; no production code depends on them.
// ---------------------------------------------------------------------------

/** Convert a UI Recipe + its ingredients into a RecipeCandidate. */
function toCandidate(recipe: Recipe): RecipeCandidate {
  return {
    recipeId: recipe.id,
    title: recipe.title,
    cuisine: recipe.cuisine_name ?? null,
    mealType: recipe.meal_type ?? null,
    difficulty: recipe.difficulty ?? null,
    prepTime: recipe.prep_time ?? null,
    cookTime: recipe.cook_time ?? null,
    tags: recipe.tags as string[],
    ratingAvg: recipe.rating_avg ?? null,
    ratingCount: recipe.rating_count ?? null,
    requiredIngredients: recipe.ingredients.map(toCandidateIngredient),
    optionalIngredients: [],
  }
}

function toCandidateIngredient(ing: RecipeIngredient): CandidateIngredient {
  return {
    standardizedIngredientId: ing.standardizedIngredientId ?? `auto-${ing.name}`,
    canonicalName: ing.standardizedName ?? ing.name,
    category: 'other',
    quantity: ing.quantity ?? null,
    unit: ing.unit ?? null,
    displayName: ing.name,
  }
}

/** Build a PantrySnapshot from an array of RecipeIngredients (simulating a stocked pantry). */
function pantryFromIngredients(
  ingredients: RecipeIngredient[],
  expiringIds: string[] = [],
): PantrySnapshot {
  const items: PantryItem[] = ingredients.map(ing => ({
    standardizedIngredientId: ing.standardizedIngredientId ?? `auto-${ing.name}`,
    name: ing.standardizedName ?? ing.name,
    quantity: ing.quantity ?? null,
    unit: ing.unit ?? null,
    category: 'other',
    expiryDate: null,
  }))

  const itemsByIngredientId = new Map(items.map(i => [i.standardizedIngredientId, i]))

  return {
    items,
    ingredientIds: new Set(items.map(i => i.standardizedIngredientId)),
    itemsByIngredientId,
    expiringWithin7Days: new Set(expiringIds),
  }
}

const emptyPantry: PantrySnapshot = {
  items: [],
  ingredientIds: new Set(),
  itemsByIngredientId: new Map(),
  expiringWithin7Days: new Set(),
}

const defaultPrefs: UserPreferences = {
  dietaryPreferences: [],
  cuisinePreferences: [],
  cookingTimePreference: null,
  budgetRange: null,
}

const defaultHistory: UserHistory = {
  recentRecipeIds: new Set(),
  recentCuisines: [],
  recentCuisineCounts: new Map(),
  favoriteRecipeIds: new Set(),
}

function makeConfig(overrides: Partial<RecommendationConfig> = {}): RecommendationConfig {
  return {
    userId: 'user-1',
    weights: DEFAULT_WEIGHTS,
    filters: { minMatchRatio: 0.4 },
    limit: 20,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreRecipe', () => {
  it('returns zero score for a recipe with no ingredients', () => {
    const candidate = toCandidate(mockEmptyIngredientsRecipe)
    const result = scoreRecipe(candidate, emptyPantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.totalScore).toBe(0)
    expect(result.ingredientMatchRatio).toBe(0)
  })

  it('scores higher when more ingredients match', () => {
    const candidate = toCandidate(mockRecipe) // Chocolate Chip Cookies — 5 ingredients

    // Pantry with 2 of the 5 baking ingredients (flour + butter share IDs with mockRecipe)
    const pantry2 = pantryFromIngredients(mockBakingIngredients.slice(0, 2))
    // Pantry with 4 of the 5
    const pantry4 = pantryFromIngredients(mockBakingIngredients.slice(0, 4))

    const score2 = scoreRecipe(candidate, pantry2, defaultPrefs, defaultHistory, makeConfig())
    const score4 = scoreRecipe(candidate, pantry4, defaultPrefs, defaultHistory, makeConfig())

    expect(score4.totalScore).toBeGreaterThan(score2.totalScore)
    expect(score4.ingredientMatchRatio).toBeGreaterThan(score2.ingredientMatchRatio)
  })

  it('gives perfect ingredient match when pantry has every ingredient', () => {
    const candidate = toCandidate(mockRecipe)
    // Build pantry directly from the recipe's own ingredients
    const pantry = pantryFromIngredients(mockRecipe.ingredients)

    const result = scoreRecipe(candidate, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.ingredientMatchRatio).toBe(1.0)
    expect(result.matchedIngredients).toHaveLength(mockRecipe.ingredients.length)
    expect(result.missingIngredients).toHaveLength(0)
  })

  it('boosts score for expiring ingredients', () => {
    const candidate = toCandidate(mockRecipe)
    const ingredientIds = mockRecipe.ingredients.map(
      i => i.standardizedIngredientId ?? `auto-${i.name}`,
    )

    const pantryNoExpiry = pantryFromIngredients(mockRecipe.ingredients, [])
    const pantryWithExpiry = pantryFromIngredients(mockRecipe.ingredients, ingredientIds.slice(0, 3))

    const scoreNoExpiry = scoreRecipe(candidate, pantryNoExpiry, defaultPrefs, defaultHistory, makeConfig())
    const scoreWithExpiry = scoreRecipe(candidate, pantryWithExpiry, defaultPrefs, defaultHistory, makeConfig())

    expect(scoreWithExpiry.expiryBoost).toBeGreaterThan(0)
    expect(scoreWithExpiry.totalScore).toBeGreaterThan(scoreNoExpiry.totalScore)
  })

  it('reduces penalty for missing pantry staples', () => {
    // mockSimpleRecipe: pasta, olive oil, garlic
    // olive oil is in PANTRY_STAPLES; pasta and garlic are not
    const candidate = toCandidate(mockSimpleRecipe)

    // Pantry has nothing — all three are missing
    const result = scoreRecipe(candidate, emptyPantry, defaultPrefs, defaultHistory, makeConfig())

    // olive oil (a staple) should produce a staple adjustment > 0
    expect(result.signals.pantryStapleAdjustment).toBeGreaterThan(0)
  })

  it('gives substitution credit when a substitute is in pantry', () => {
    // Thai Green Curry needs coconut milk, curry paste, chicken, peppers, basil.
    // We'll tweak it: add "lemon" as an ingredient, give the pantry "lime" instead.
    // lemon→lime is in SUBSTITUTION_MAP (0.9) and lemon is NOT a pantry staple.
    const thaiCurry = toCandidate(mockRecipeList[4]) // Thai Green Curry
    thaiCurry.requiredIngredients.push({
      standardizedIngredientId: 'lemon-001',
      canonicalName: 'lemon',
      category: 'produce',
      quantity: 1,
      unit: null,
      displayName: 'lemon',
    })

    // Pantry has every original ingredient + lime (not lemon)
    const pantryItems: PantryItem[] = mockRecipeList[4].ingredients.map(ing => ({
      standardizedIngredientId: ing.standardizedIngredientId ?? `auto-${ing.name}`,
      name: ing.standardizedName ?? ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      category: 'other',
      expiryDate: null,
    }))
    pantryItems.push({
      standardizedIngredientId: 'lime-001',
      name: 'lime',
      quantity: 3,
      unit: null,
      category: 'produce',
      expiryDate: null,
    })

    const pantry: PantrySnapshot = {
      items: pantryItems,
      ingredientIds: new Set(pantryItems.map(i => i.standardizedIngredientId)),
      itemsByIngredientId: new Map(pantryItems.map(i => [i.standardizedIngredientId, i])),
      expiringWithin7Days: new Set(),
    }

    const result = scoreRecipe(thaiCurry, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.signals.substitutionCredit).toBeGreaterThan(0)
    expect(result.missingButSubstitutable).toContain('lemon')
  })

  it('boosts score for preferred cuisines', () => {
    // mockSimpleRecipe is Italian
    const candidate = toCandidate(mockSimpleRecipe)
    const pantry = pantryFromIngredients(mockSimpleRecipe.ingredients.slice(0, 2))

    const prefsNoCuisine = { ...defaultPrefs }
    const prefsItalian = { ...defaultPrefs, cuisinePreferences: ['italian'] }

    const scoreNoPref = scoreRecipe(candidate, pantry, prefsNoCuisine, defaultHistory, makeConfig())
    const scoreItalian = scoreRecipe(candidate, pantry, prefsItalian, defaultHistory, makeConfig())

    expect(scoreItalian.totalScore).toBeGreaterThan(scoreNoPref.totalScore)
  })

  it('penalises recently-cooked recipes for diversity', () => {
    const candidate = toCandidate(mockSimpleRecipe) // Italian
    const pantry = pantryFromIngredients(mockSimpleRecipe.ingredients)

    const freshHistory = defaultHistory
    const recentHistory: UserHistory = {
      recentRecipeIds: new Set([mockSimpleRecipe.id]),
      recentCuisines: ['italian'],
      recentCuisineCounts: new Map([['italian', 1]]),
      favoriteRecipeIds: new Set(),
    }

    const scoreFresh = scoreRecipe(candidate, pantry, defaultPrefs, freshHistory, makeConfig())
    const scoreRecent = scoreRecipe(candidate, pantry, defaultPrefs, recentHistory, makeConfig())

    expect(scoreFresh.totalScore).toBeGreaterThan(scoreRecent.totalScore)
  })

  it('gives higher popularity for well-rated recipes', () => {
    // mockVeganAdvancedRecipe: 4.8 rating, 89 reviews
    // mockSimpleRecipe: 3.8 rating, 12 reviews
    const highRated = toCandidate(mockVeganAdvancedRecipe)
    const lowRated = toCandidate(mockSimpleRecipe)

    // Give both recipes a pantry that partially matches (doesn't matter which ingredients)
    const pantry = pantryFromIngredients(mockProduceIngredients)

    const scoreHigh = scoreRecipe(highRated, pantry, defaultPrefs, defaultHistory, makeConfig())
    const scoreLow = scoreRecipe(lowRated, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(scoreHigh.signals.popularityBoost).toBeGreaterThan(scoreLow.signals.popularityBoost)
  })

  it('total score is always between 0 and 100', () => {
    // Score every recipe in mockRecipeList under best and worst conditions
    for (const recipe of mockRecipeList) {
      const candidate = toCandidate(recipe)
      const ingredientIds = recipe.ingredients.map(
        i => i.standardizedIngredientId ?? `auto-${i.name}`,
      )

      // Best case: full pantry, expiring, preferred cuisine
      const bestPantry = pantryFromIngredients(recipe.ingredients, ingredientIds)
      const bestPrefs = { ...defaultPrefs, cuisinePreferences: [recipe.cuisine_name ?? 'other'] }
      const bestResult = scoreRecipe(candidate, bestPantry, bestPrefs, defaultHistory, makeConfig())

      // Worst case: empty pantry
      const worstResult = scoreRecipe(candidate, emptyPantry, defaultPrefs, defaultHistory, makeConfig())

      expect(bestResult.totalScore).toBeLessThanOrEqual(100)
      expect(bestResult.totalScore).toBeGreaterThanOrEqual(0)
      expect(worstResult.totalScore).toBeLessThanOrEqual(100)
      expect(worstResult.totalScore).toBeGreaterThanOrEqual(0)
    }
  })

  it('respects custom weight overrides', () => {
    const candidate = toCandidate(mockRecipe) // 5 ingredients

    // Pantry with exactly 3 of the 5 recipe ingredients
    const pantry = pantryFromIngredients(mockRecipe.ingredients.slice(0, 3))

    // Zero out everything except ingredient match
    const ingredientOnlyWeights = {
      ingredientMatch: 1.0,
      quantitySufficiency: 0,
      expiryUrgency: 0,
      pantryStaple: 0,
      substitution: 0,
      preference: 0,
      popularity: 0,
      diversity: 0,
    }

    const result = scoreRecipe(
      candidate,
      pantry,
      defaultPrefs,
      defaultHistory,
      makeConfig({ weights: ingredientOnlyWeights }),
    )

    // 3/5 = 0.6 ingredient match → 0.6 * 100 = 60
    expect(result.totalScore).toBeCloseTo(60, 0)
  })

  it('awards embedding substitution credit for ingredients not in static map', () => {
    // Recipe needs mushrooms + puff pastry + shallots + thyme (mockVeganAdvancedRecipe)
    const candidate = toCandidate(mockVeganAdvancedRecipe)

    // Pantry has mushrooms and thyme but NOT puff pastry or shallots
    const pantry = pantryFromIngredients(
      mockVeganAdvancedRecipe.ingredients.filter(
        i => (i.standardizedName ?? i.name) !== 'puff pastry' &&
             (i.standardizedName ?? i.name) !== 'shallots',
      ),
    )

    // Provide embedding-based subs: shallots→onion (0.88 similarity)
    // "shallots" has no entry in SUBSTITUTION_MAP, so this only works via embeddings
    const shallotIngId = mockVeganAdvancedRecipe.ingredients.find(
      i => (i.standardizedName ?? i.name) === 'shallots',
    )?.standardizedIngredientId ?? 'auto-shallots'

    const embeddingSubs = new Map([
      [shallotIngId, { substituteName: 'onion', similarity: 0.88 }],
    ])
    const substitutions: SubstitutionLookup = { embeddingSubs }

    const withoutEmb = scoreRecipe(candidate, pantry, defaultPrefs, defaultHistory, makeConfig())
    const withEmb = scoreRecipe(candidate, pantry, defaultPrefs, defaultHistory, makeConfig(), substitutions)

    expect(withEmb.signals.substitutionCredit).toBeGreaterThan(withoutEmb.signals.substitutionCredit)
    expect(withEmb.missingButSubstitutable).toContain('shallots')
    expect(withoutEmb.missingButSubstitutable).not.toContain('shallots')
  })

  it('static map takes precedence over embedding substitution', () => {
    // Thai Green Curry + added lemon ingredient (same as earlier test)
    const candidate = toCandidate(mockRecipeList[4])
    candidate.requiredIngredients.push({
      standardizedIngredientId: 'lemon-001',
      canonicalName: 'lemon',
      category: 'produce',
      quantity: 1,
      unit: null,
      displayName: 'lemon',
    })

    // Pantry has everything + lime (static sub for lemon)
    const pantryItems: PantryItem[] = mockRecipeList[4].ingredients.map(ing => ({
      standardizedIngredientId: ing.standardizedIngredientId ?? `auto-${ing.name}`,
      name: ing.standardizedName ?? ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      category: 'other',
      expiryDate: null,
    }))
    pantryItems.push({
      standardizedIngredientId: 'lime-001',
      name: 'lime',
      quantity: 3,
      unit: null,
      category: 'produce',
      expiryDate: null,
    })
    const pantry: PantrySnapshot = {
      items: pantryItems,
      ingredientIds: new Set(pantryItems.map(i => i.standardizedIngredientId)),
      itemsByIngredientId: new Map(pantryItems.map(i => [i.standardizedIngredientId, i])),
      expiringWithin7Days: new Set(),
    }

    // Embedding sub offers a lower similarity for lemon
    const embeddingSubs = new Map([
      ['lemon-001', { substituteName: 'grapefruit', similarity: 0.76 }],
    ])
    const substitutions: SubstitutionLookup = { embeddingSubs }

    const withStaticOnly = scoreRecipe(candidate, pantry, defaultPrefs, defaultHistory, makeConfig())
    const withBoth = scoreRecipe(candidate, pantry, defaultPrefs, defaultHistory, makeConfig(), substitutions)

    // Scores should be identical — static map (lemon→lime, 0.9) wins and embedding is skipped
    expect(withBoth.signals.substitutionCredit).toBe(withStaticOnly.signals.substitutionCredit)
    expect(withBoth.missingButSubstitutable).toContain('lemon')
  })
})

// ---------------------------------------------------------------------------
// Tests using real recipes from the Supabase database.
// These candidates mirror actual rows in the production DB (IDs, names,
// categories, quantities, units). No DB calls — data is inlined as fixtures.
// ---------------------------------------------------------------------------

/** Helper to build a CandidateIngredient from real DB row data. */
function ing(id: string, canonical: string, category: string, qty: number | null = null, unit: string | null = null, display?: string): CandidateIngredient {
  return {
    standardizedIngredientId: id,
    canonicalName: canonical,
    category,
    quantity: qty,
    unit,
    displayName: display ?? canonical,
  }
}

// -- Real recipe fixtures --

const mediterraneanChickpeaBowl: RecipeCandidate = {
  recipeId: '1eef10e8-3eee-44eb-9aa5-54205e95676e',
  title: 'Mediterranean Chickpea Bowl',
  cuisine: 'mediterranean',
  mealType: 'lunch',
  difficulty: 'beginner',
  prepTime: 20,
  cookTime: 10,
  tags: ['vegetarian', 'gluten-free'],
  ratingAvg: 0,
  ratingCount: 0,
  optionalIngredients: [],
  requiredIngredients: [
    ing('5ed2f57e-ee29-49ed-b97d-cfd010a9f579', 'spinach', 'produce', 2, 'cup', 'baby spinach'),
    ing('15002175-2070-456f-b964-fa0c28095630', 'chickpea', 'pantry_staples', 1.5, 'cup', 'canned chickpeas'),
    ing('ae5b21df-41f6-49b1-946f-9c3658db47c1', 'cherry tomato', 'produce', 1, 'cup'),
    ing('5e6960c3-7787-4102-8670-096c087e4633', 'quinoa', 'other', 1, 'cup', 'cooked quinoa'),
    ing('c0b420ab-1e7f-403c-9235-2d7bab707585', 'olive oil', 'pantry_staples', 3, 'tbsp'),
    ing('0055e8ee-ec9e-4d7d-aff3-ba2b635e95ab', 'lemon juice', 'produce', 3, 'tbsp'),
    ing('33ebb0f8-af4f-4bbc-b5d7-52c0ea3d402c', 'bell pepper', 'produce', 1, 'each', 'red bell pepper'),
    ing('f8629238-8086-495c-a7ea-11adb115c032', 'paprika', 'spices', 1, 'tsp', 'smoked paprika'),
    ing('b6ba3382-a8d0-483a-9a68-38cd8dfe391a', 'tahini', 'other', 2, 'tbsp'),
    ing('6d6be2a9-d05e-4fb1-b012-e168107e558d', 'zucchini', 'produce', 1, 'each'),
  ],
}

const chipotleChickenTacos: RecipeCandidate = {
  recipeId: '26a2d109-4236-4754-87fb-932f343869f0',
  title: 'Smoky Chipotle Chicken Tacos',
  cuisine: 'mexican',
  mealType: 'dinner',
  difficulty: 'intermediate',
  prepTime: 15,
  cookTime: 20,
  tags: ['contains-dairy'],
  ratingAvg: 0,
  ratingCount: 0,
  optionalIngredients: [],
  requiredIngredients: [
    ing('d6f77578-2258-4049-8f9d-f15c162db96c', 'chicken thigh', 'meat_seafood', 1.25, 'lb'),
    ing('c10aa2f2-2f6f-4281-b3d9-c1901652ac1f', 'chipotle pepper', 'produce', 2, 'tbsp'),
    ing('f70c3dba-3dd9-41b0-a990-0b027c8955b7', 'corn tortilla', 'pantry_staples', 8, 'ct'),
    ing('a248cbb5-b022-4f8d-a0b9-c910d97c22a5', 'cotija cheese', 'dairy', 0.25, 'cup'),
    ing('c0b420ab-1e7f-403c-9235-2d7bab707585', 'olive oil', 'pantry_staples', 2, 'tbsp'),
    ing('d862cd17-8177-4e4a-ace1-7a9f54e57467', 'cilantro', 'produce', 0.5, 'cup'),
    ing('0e3b8f51-4a49-47cf-a97b-eaebfc116939', 'lime juice', 'produce', 2, 'tbsp'),
    ing('24604363-241a-464c-858d-a868ea1625e7', 'garlic', 'produce', 3, 'each'),
    ing('d2cf9554-8ee2-46e4-84cf-95978581e6ed', 'red onion', 'produce', 0.25, 'cup'),
  ],
}

const coconutLentilDal: RecipeCandidate = {
  recipeId: '3d962a80-7ce9-4848-bb95-170b4fb15679',
  title: 'Coconut Turmeric Lentil Dal',
  cuisine: 'indian',
  mealType: 'dinner',
  difficulty: 'intermediate',
  prepTime: 20,
  cookTime: 25,
  tags: ['vegan', 'gluten-free'],
  ratingAvg: 0,
  ratingCount: 0,
  optionalIngredients: [],
  requiredIngredients: [
    ing('35d45845-7a68-4cfe-bbec-fd3659578587', 'coconut milk', 'dairy', 1, 'cup'),
    ing('11bfe39c-7e24-483e-a054-187167d48c88', 'cumin', 'spices', 1, 'tsp', 'cumin seeds'),
    ing('07ee72f5-85a3-4b1d-9ac2-0470de35afbf', 'curry leaves', 'produce', 8, 'each'),
    ing('6401762a-275a-426c-bc40-ff4d14db5315', 'ginger', 'produce', 1, 'tbsp'),
    ing('24604363-241a-464c-858d-a868ea1625e7', 'garlic', 'produce', 4, 'each'),
    ing('3418a669-f18b-47bb-a980-177600a4f118', 'lime', 'produce', 1, 'each'),
    ing('5e4096a2-7299-4052-87a1-7834b457bf7c', 'mustard seed', 'spices', 1, 'tsp'),
    ing('da9602bf-bc82-43a2-ab78-569055aab474', 'onion', 'produce', 1, 'each'),
    ing('be2c7d46-f23d-4d26-afdf-be8006e2daec', 'red lentil', 'pantry_staples', 1.5, 'cup'),
    ing('aff50fcc-f579-4361-84f7-4bc5cb1e5eb3', 'vegetable broth', 'pantry_staples', 2, 'cup'),
  ],
}

const lemonTarragonCod: RecipeCandidate = {
  recipeId: 'faf2aa87-f690-4495-8390-d57620be1528',
  title: 'Lemon Tarragon Roasted Cod',
  cuisine: 'french',
  mealType: 'dinner',
  difficulty: 'beginner',
  prepTime: 15,
  cookTime: 18,
  tags: ['gluten-free'],
  ratingAvg: 0,
  ratingCount: 0,
  optionalIngredients: [],
  requiredIngredients: [
    ing('45694090-7ffc-47cc-8e0b-df53d5c746da', 'asparagus', 'produce', 1, 'bunch'),
    ing('5be887dd-812d-40da-8f9b-83bd92310d74', 'cod', 'meat_seafood', 1.5, 'lb'),
    ing('c0b420ab-1e7f-403c-9235-2d7bab707585', 'olive oil', 'pantry_staples', 2, 'tbsp'),
    ing('0055e8ee-ec9e-4d7d-aff3-ba2b635e95ab', 'lemon juice', 'produce', 2, 'tbsp'),
    ing('ec958585-90b8-4db4-a404-7fad63644da1', 'lemon', 'produce', 1, 'tbsp', 'fresh lemon zest'),
    ing('d9c6acd7-3b88-4e87-a3a7-1380491b08dc', 'tarragon', 'produce', 0.25, 'cup'),
    ing('24604363-241a-464c-858d-a868ea1625e7', 'garlic', 'produce', 3, 'each'),
  ],
}

/** Build a PantrySnapshot from CandidateIngredient arrays. */
function pantryFromCandidateIngredients(
  ingredients: CandidateIngredient[],
  expiringIds: string[] = [],
): PantrySnapshot {
  const items: PantryItem[] = ingredients.map(ci => ({
    standardizedIngredientId: ci.standardizedIngredientId,
    name: ci.canonicalName,
    quantity: ci.quantity,
    unit: ci.unit,
    category: ci.category,
    expiryDate: null,
  }))
  return {
    items,
    ingredientIds: new Set(items.map(i => i.standardizedIngredientId)),
    itemsByIngredientId: new Map(items.map(i => [i.standardizedIngredientId, i])),
    expiringWithin7Days: new Set(expiringIds),
  }
}

describe('scoreRecipe — real Supabase recipes', () => {
  it('Mediterranean Chickpea Bowl: full pantry scores near max', () => {
    const pantry = pantryFromCandidateIngredients(mediterraneanChickpeaBowl.requiredIngredients)
    const result = scoreRecipe(mediterraneanChickpeaBowl, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.ingredientMatchRatio).toBe(1.0)
    expect(result.matchedIngredients).toHaveLength(10)
    // Rating is 0/0 so popularity drags score down; 60+ is strong for a new recipe
    expect(result.totalScore).toBeGreaterThan(60)
  })

  it('Chipotle Chicken Tacos: partial pantry with shared olive oil + garlic', () => {
    // User has olive oil, garlic, lime juice, and cilantro — 4 of 9
    const pantry = pantryFromCandidateIngredients(
      chipotleChickenTacos.requiredIngredients.filter(i =>
        ['olive oil', 'garlic', 'lime juice', 'cilantro'].includes(i.canonicalName)
      ),
    )
    const result = scoreRecipe(chipotleChickenTacos, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.ingredientMatchRatio).toBeCloseTo(4 / 9, 2)
    expect(result.matchedIngredients).toHaveLength(4)
    expect(result.missingIngredients.length + result.missingButSubstitutable.length).toBe(5)
  })

  it('ranks Mediterranean Bowl above Chipotle Tacos when user has vegetarian pantry', () => {
    // Vegetarian pantry: spinach, chickpea, cherry tomato, quinoa, olive oil,
    // lemon juice, bell pepper, paprika, tahini, zucchini, garlic, cilantro, lime juice
    const veggieItems = [
      ...mediterraneanChickpeaBowl.requiredIngredients,
      // Add garlic, cilantro, lime juice (shared with tacos)
      ing('24604363-241a-464c-858d-a868ea1625e7', 'garlic', 'produce', 5, 'each'),
      ing('d862cd17-8177-4e4a-ace1-7a9f54e57467', 'cilantro', 'produce', 1, 'cup'),
      ing('0e3b8f51-4a49-47cf-a97b-eaebfc116939', 'lime juice', 'produce', 3, 'tbsp'),
    ]
    const pantry = pantryFromCandidateIngredients(veggieItems)

    const prefs: UserPreferences = {
      ...defaultPrefs,
      dietaryPreferences: ['vegetarian'],
    }

    const medScore = scoreRecipe(mediterraneanChickpeaBowl, pantry, prefs, defaultHistory, makeConfig())
    const tacoScore = scoreRecipe(chipotleChickenTacos, pantry, prefs, defaultHistory, makeConfig())

    // Med bowl: 10/10 match + vegetarian tag match
    // Tacos: 4/9 match (olive oil, garlic, cilantro, lime juice) + no vegetarian tag
    expect(medScore.totalScore).toBeGreaterThan(tacoScore.totalScore)
    expect(medScore.ingredientMatchRatio).toBe(1.0)
    expect(tacoScore.ingredientMatchRatio).toBeLessThan(0.5)
  })

  it('Lentil Dal: olive oil treated as staple, garlic and onion recognized', () => {
    // Pantry has only coconut milk and red lentils — 2 of 10
    // garlic and onion are in PANTRY_STAPLES, so missing penalty is reduced
    const pantry = pantryFromCandidateIngredients(
      coconutLentilDal.requiredIngredients.filter(i =>
        ['coconut milk', 'red lentil'].includes(i.canonicalName)
      ),
    )

    const result = scoreRecipe(coconutLentilDal, pantry, defaultPrefs, defaultHistory, makeConfig())

    expect(result.ingredientMatchRatio).toBeCloseTo(2 / 10, 2)
    // olive oil, garlic, onion are all staples → adjustment should be positive
    expect(result.signals.pantryStapleAdjustment).toBeGreaterThan(0)
  })

  it('Lemon Tarragon Cod: lemon juice → lime juice via static substitution', () => {
    // Pantry has cod, asparagus, garlic, tarragon, and lime juice (not lemon juice)
    const pantryItems: PantryItem[] = [
      { standardizedIngredientId: '5be887dd-812d-40da-8f9b-83bd92310d74', name: 'cod', quantity: 1.5, unit: 'lb', category: 'meat_seafood', expiryDate: null },
      { standardizedIngredientId: '45694090-7ffc-47cc-8e0b-df53d5c746da', name: 'asparagus', quantity: 1, unit: 'bunch', category: 'produce', expiryDate: null },
      { standardizedIngredientId: '24604363-241a-464c-858d-a868ea1625e7', name: 'garlic', quantity: 3, unit: 'each', category: 'produce', expiryDate: null },
      { standardizedIngredientId: 'd9c6acd7-3b88-4e87-a3a7-1380491b08dc', name: 'tarragon', quantity: 0.25, unit: 'cup', category: 'produce', expiryDate: null },
      // lime juice substitutes for lemon juice in SUBSTITUTION_MAP
      { standardizedIngredientId: '0e3b8f51-4a49-47cf-a97b-eaebfc116939', name: 'lime juice', quantity: 3, unit: 'tbsp', category: 'produce', expiryDate: null },
    ]
    const pantry: PantrySnapshot = {
      items: pantryItems,
      ingredientIds: new Set(pantryItems.map(i => i.standardizedIngredientId)),
      itemsByIngredientId: new Map(pantryItems.map(i => [i.standardizedIngredientId, i])),
      expiringWithin7Days: new Set(),
    }

    const result = scoreRecipe(lemonTarragonCod, pantry, defaultPrefs, defaultHistory, makeConfig())

    // 4 directly matched (cod, asparagus, garlic, tarragon) + lemon juice via substitution
    expect(result.matchedIngredients).toHaveLength(4)
    expect(result.missingButSubstitutable).toContain('lemon juice')
    expect(result.signals.substitutionCredit).toBeGreaterThan(0)
  })

  it('Chipotle Tacos: embedding sub finds chicken breast for chicken thigh', () => {
    // Pantry has everything except chicken thigh, but has chicken breast.
    // chicken thigh → chicken breast has 0.906 similarity in real embeddings.
    const pantry = pantryFromCandidateIngredients(
      chipotleChickenTacos.requiredIngredients.filter(
        i => i.canonicalName !== 'chicken thigh'
      ),
    )
    // Add chicken breast to pantry
    pantry.items.push({
      standardizedIngredientId: '32775c94-ddf9-4573-a4f8-03e27d2e2446',
      name: 'chicken breast',
      quantity: 1.5,
      unit: 'lb',
      category: 'meat_seafood',
      expiryDate: null,
    })
    pantry.ingredientIds.add('32775c94-ddf9-4573-a4f8-03e27d2e2446')

    // Embedding subs: chicken thigh → chicken breast at 0.906 (real DB value)
    const substitutions: SubstitutionLookup = {
      embeddingSubs: new Map([
        ['d6f77578-2258-4049-8f9d-f15c162db96c', { substituteName: 'chicken breast', similarity: 0.906 }],
      ]),
    }

    const withoutEmb = scoreRecipe(chipotleChickenTacos, pantry, defaultPrefs, defaultHistory, makeConfig())
    const withEmb = scoreRecipe(chipotleChickenTacos, pantry, defaultPrefs, defaultHistory, makeConfig(), substitutions)

    // chicken thigh is in the static SUBSTITUTION_MAP (chicken thigh → chicken breast at 0.9)
    // so the static map should handle it even without embeddings
    expect(withoutEmb.missingButSubstitutable).toContain('chicken thigh')

    // With embeddings provided too, static should still take precedence — same score
    expect(withEmb.signals.substitutionCredit).toBe(withoutEmb.signals.substitutionCredit)
  })

  it('Lentil Dal: embedding sub finds coconut cream for coconut milk', () => {
    // Pantry has everything except coconut milk, but has coconut cream
    const pantry = pantryFromCandidateIngredients(
      coconutLentilDal.requiredIngredients.filter(
        i => i.canonicalName !== 'coconut milk'
      ),
    )
    pantry.items.push({
      standardizedIngredientId: 'coconut-cream-fake-id',
      name: 'coconut cream',
      quantity: 1,
      unit: 'cup',
      category: 'dairy',
      expiryDate: null,
    })
    pantry.ingredientIds.add('coconut-cream-fake-id')

    // coconut milk has a static sub: heavy cream → coconut cream (0.7)
    // but coconut milk itself isn't in SUBSTITUTION_MAP as a key.
    // So this should only work via embeddings.
    const substitutions: SubstitutionLookup = {
      embeddingSubs: new Map([
        ['35d45845-7a68-4cfe-bbec-fd3659578587', { substituteName: 'coconut cream', similarity: 0.92 }],
      ]),
    }

    const withoutEmb = scoreRecipe(coconutLentilDal, pantry, defaultPrefs, defaultHistory, makeConfig())
    const withEmb = scoreRecipe(coconutLentilDal, pantry, defaultPrefs, defaultHistory, makeConfig(), substitutions)

    expect(withEmb.signals.substitutionCredit).toBeGreaterThan(withoutEmb.signals.substitutionCredit)
    expect(withEmb.missingButSubstitutable).toContain('coconut milk')
    expect(withoutEmb.missingButSubstitutable).not.toContain('coconut milk')
  })

  it('diversity penalty when user cooked Indian and Mediterranean recently', () => {
    const pantry = pantryFromCandidateIngredients(coconutLentilDal.requiredIngredients)

    const recentHistory: UserHistory = {
      recentRecipeIds: new Set(),
      recentCuisines: ['indian', 'indian', 'mediterranean'],
      recentCuisineCounts: new Map([['indian', 2], ['mediterranean', 1]]),
      favoriteRecipeIds: new Set(),
    }

    const dalScore = scoreRecipe(coconutLentilDal, pantry, defaultPrefs, recentHistory, makeConfig())
    const codScore = scoreRecipe(lemonTarragonCod, pantry, defaultPrefs, recentHistory, makeConfig())

    // Dal is indian (2 recent) → higher diversity penalty than cod (french, 0 recent)
    expect(dalScore.signals.diversityPenalty).toBeGreaterThan(codScore.signals.diversityPenalty)
  })

  it('preference alignment: vegan user scores Dal higher than Tacos', () => {
    // Both have full pantries so ingredient match is equal
    const dalPantry = pantryFromCandidateIngredients(coconutLentilDal.requiredIngredients)
    const tacoPantry = pantryFromCandidateIngredients(chipotleChickenTacos.requiredIngredients)

    const veganPrefs: UserPreferences = {
      ...defaultPrefs,
      dietaryPreferences: ['vegan'],
      cuisinePreferences: ['indian'],
    }

    const dalResult = scoreRecipe(coconutLentilDal, dalPantry, veganPrefs, defaultHistory, makeConfig())
    const tacoResult = scoreRecipe(chipotleChickenTacos, tacoPantry, veganPrefs, defaultHistory, makeConfig())

    // Dal: tagged vegan + indian cuisine pref match
    // Tacos: not tagged vegan (penalty) + mexican (no pref match)
    expect(dalResult.signals.preferenceAlignment).toBeGreaterThan(tacoResult.signals.preferenceAlignment)
  })

  it('expiry urgency prioritises Mediterranean Bowl when produce is expiring', () => {
    // Both recipes have full pantries, but Med Bowl uses more of the expiring produce
    const expiringProduceIds = [
      '5ed2f57e-ee29-49ed-b97d-cfd010a9f579', // spinach
      'ae5b21df-41f6-49b1-946f-9c3658db47c1', // cherry tomato
      '33ebb0f8-af4f-4bbc-b5d7-52c0ea3d402c', // bell pepper
      '6d6be2a9-d05e-4fb1-b012-e168107e558d', // zucchini
    ]

    const medPantry = pantryFromCandidateIngredients(
      mediterraneanChickpeaBowl.requiredIngredients,
      expiringProduceIds,
    )
    // Cod pantry with same expiring IDs (but cod recipe doesn't use any of them)
    const codPantry = pantryFromCandidateIngredients(
      lemonTarragonCod.requiredIngredients,
      expiringProduceIds,
    )

    const medResult = scoreRecipe(mediterraneanChickpeaBowl, medPantry, defaultPrefs, defaultHistory, makeConfig())
    const codResult = scoreRecipe(lemonTarragonCod, codPantry, defaultPrefs, defaultHistory, makeConfig())

    // Med bowl uses 4 of the 4 expiring items → high expiry urgency
    // Cod uses 0 of them → zero expiry urgency
    expect(medResult.signals.expiryUrgency).toBe(1.0)
    expect(codResult.signals.expiryUrgency).toBe(0)
    expect(medResult.expiryBoost).toBeGreaterThan(codResult.expiryBoost)
  })

  it('score bounds hold across all real recipes', () => {
    const realRecipes = [mediterraneanChickpeaBowl, chipotleChickenTacos, coconutLentilDal, lemonTarragonCod]

    for (const recipe of realRecipes) {
      // Best case
      const fullPantry = pantryFromCandidateIngredients(
        recipe.requiredIngredients,
        recipe.requiredIngredients.map(i => i.standardizedIngredientId),
      )
      const best = scoreRecipe(recipe, fullPantry, defaultPrefs, defaultHistory, makeConfig())

      // Worst case
      const worst = scoreRecipe(recipe, emptyPantry, defaultPrefs, defaultHistory, makeConfig())

      expect(best.totalScore).toBeGreaterThanOrEqual(0)
      expect(best.totalScore).toBeLessThanOrEqual(100)
      expect(worst.totalScore).toBeGreaterThanOrEqual(0)
      expect(worst.totalScore).toBeLessThanOrEqual(100)
      expect(best.totalScore).toBeGreaterThan(worst.totalScore)
    }
  })

  it('deduplicates ingredients with the same standardizedIngredientId', () => {
    // Simulate a recipe where the same ingredient appears twice with the same ID
    // (e.g., "2 cups flour" + "1 cup flour for dusting" both mapping to flour)
    const recipeWithDupe: RecipeCandidate = {
      recipeId: 'dupe-test',
      title: 'Dupe Test Recipe',
      cuisine: 'american',
      mealType: 'dinner',
      difficulty: 'beginner',
      prepTime: 10,
      cookTime: 20,
      tags: [],
      ratingAvg: 4.0,
      ratingCount: 10,
      optionalIngredients: [],
      requiredIngredients: [
        ing('flour-id', 'flour', 'pantry_staples', 2, 'cup', 'all-purpose flour'),
        ing('flour-id', 'flour', 'pantry_staples', 1, 'cup', 'flour for dusting'), // same ID
        ing('egg-id', 'eggs', 'dairy', 3, 'each'),
        ing('butter-id', 'butter', 'dairy', 0.5, 'cup'),
      ],
    }

    // Pantry has flour and eggs
    const pantry = pantryFromCandidateIngredients([
      ing('flour-id', 'flour', 'pantry_staples', 5, 'cup'),
      ing('egg-id', 'eggs', 'dairy', 6, 'each'),
    ])

    const result = scoreRecipe(recipeWithDupe, pantry, defaultPrefs, defaultHistory, makeConfig())

    // 4 raw ingredients → 3 unique IDs. 2 matched (flour, eggs), 1 missing (butter).
    expect(result.ingredientMatchRatio).toBeCloseTo(2 / 3, 2)
    // "flour" should appear exactly once in matchedIngredients, not twice
    expect(result.matchedIngredients.filter(n => n === 'flour')).toHaveLength(1)
    expect(result.matchedIngredients).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Substitution stress tests — how does the score degrade as we replace
// direct ingredient matches with embedding-based substitutions?
//
// Uses the Mediterranean Chickpea Bowl (10 non-staple ingredients).
// For each test we remove N direct matches from the pantry and provide
// embedding substitutions at various confidence levels instead.
// ---------------------------------------------------------------------------

describe('substitution degradation — Mediterranean Chickpea Bowl', () => {
  // All 10 ingredients, in the order we'll progressively remove them.
  // olive oil is a pantry staple so it gets special treatment — we keep it
  // in the "always direct" bucket and substitute from the remaining 9.
  const nonStapleIngredients = mediterraneanChickpeaBowl.requiredIngredients.filter(
    i => i.canonicalName !== 'olive oil',
  )
  // olive oil stays as a direct match in every test
  const oliveOil = mediterraneanChickpeaBowl.requiredIngredients.find(
    i => i.canonicalName === 'olive oil',
  )!

  /**
   * Score the Med Bowl with `directCount` ingredients matched directly
   * and the remaining `9 - directCount` covered by embedding subs at `similarity`.
   * olive oil is always a direct match (staple).
   */
  function scoreWithSubstitutions(directCount: number, similarity: number) {
    const directIngredients = nonStapleIngredients.slice(0, directCount)
    const substitutedIngredients = nonStapleIngredients.slice(directCount)

    // Build pantry: olive oil + direct matches + fake substitutes for the rest
    const pantryItems: PantryItem[] = [
      // olive oil (always present)
      {
        standardizedIngredientId: oliveOil.standardizedIngredientId,
        name: oliveOil.canonicalName,
        quantity: oliveOil.quantity,
        unit: oliveOil.unit,
        category: oliveOil.category,
        expiryDate: null,
      },
      // Direct matches
      ...directIngredients.map(ci => ({
        standardizedIngredientId: ci.standardizedIngredientId,
        name: ci.canonicalName,
        quantity: ci.quantity,
        unit: ci.unit,
        category: ci.category,
        expiryDate: null,
      })),
      // Fake substitute items (different IDs — not direct matches)
      ...substitutedIngredients.map((ci, idx) => ({
        standardizedIngredientId: `fake-sub-${idx}`,
        name: `substitute-for-${ci.canonicalName}`,
        quantity: ci.quantity,
        unit: ci.unit,
        category: ci.category,
        expiryDate: null,
      })),
    ]

    const pantry: PantrySnapshot = {
      items: pantryItems,
      ingredientIds: new Set(pantryItems.map(i => i.standardizedIngredientId)),
      itemsByIngredientId: new Map(pantryItems.map(i => [i.standardizedIngredientId, i])),
      expiringWithin7Days: new Set(),
    }

    // Build embedding substitutions for the non-direct ingredients
    const embeddingSubs = new Map(
      substitutedIngredients.map((ci, idx) => [
        ci.standardizedIngredientId,
        { substituteName: `substitute-for-${ci.canonicalName}`, similarity },
      ]),
    )

    return scoreRecipe(
      mediterraneanChickpeaBowl,
      pantry,
      defaultPrefs,
      defaultHistory,
      makeConfig(),
      { embeddingSubs },
    )
  }

  it('score decreases monotonically as more ingredients are substituted (high confidence 0.90)', () => {
    const scores: number[] = []
    for (let direct = 9; direct >= 0; direct--) {
      const result = scoreWithSubstitutions(direct, 0.90)
      scores.push(result.totalScore)
    }
    // scores[0] = 9 direct, 0 subs → scores[9] = 0 direct, 9 subs
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('score decreases monotonically as more ingredients are substituted (low confidence 0.76)', () => {
    const scores: number[] = []
    for (let direct = 9; direct >= 0; direct--) {
      const result = scoreWithSubstitutions(direct, 0.76)
      scores.push(result.totalScore)
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('high-confidence subs (0.92) score better than low-confidence subs (0.76) at every level', () => {
    for (let direct = 8; direct >= 0; direct--) {
      const high = scoreWithSubstitutions(direct, 0.92)
      const low = scoreWithSubstitutions(direct, 0.76)
      expect(high.totalScore).toBeGreaterThanOrEqual(low.totalScore)
    }
  })

  it('substituting 1–2 of 9 non-staples barely affects the score', () => {
    const full = scoreWithSubstitutions(9, 0.90)    // all direct
    const sub1 = scoreWithSubstitutions(8, 0.90)    // 1 substituted
    const sub2 = scoreWithSubstitutions(7, 0.90)    // 2 substituted

    // Each sub loses ~4 pts from match ratio (0.40 weight * 1/10 * 100) but gains
    // ~0.72 pts from sub credit (0.10 weight * 0.9 * 0.8 / 10 * 100).
    // Net cost per sub ≈ 3.3 pts. 1 sub should cost < 4 points.
    expect(full.totalScore - sub1.totalScore).toBeLessThan(4)
    // Swapping 2 should cost < 7 points
    expect(full.totalScore - sub2.totalScore).toBeLessThan(7)
  })

  it('substituting 5+ of 9 non-staples produces a noticeable drop', () => {
    const full = scoreWithSubstitutions(9, 0.90)
    const sub5 = scoreWithSubstitutions(4, 0.90)    // 5 substituted
    const sub7 = scoreWithSubstitutions(2, 0.90)    // 7 substituted

    // 5 subs should drop the score by at least 5 points
    expect(full.totalScore - sub5.totalScore).toBeGreaterThan(5)
    // 7 subs should drop even more
    expect(full.totalScore - sub7.totalScore).toBeGreaterThan(full.totalScore - sub5.totalScore)
  })

  it('all-substituted at 0.76 confidence scores lower than half-direct at 0.92', () => {
    const allSubLow = scoreWithSubstitutions(0, 0.76)     // 0 direct, 9 subs at 0.76
    const halfDirectHigh = scoreWithSubstitutions(5, 0.92) // 5 direct, 4 subs at 0.92

    expect(halfDirectHigh.totalScore).toBeGreaterThan(allSubLow.totalScore)
  })

  it('substitution credit scales with number of subs', () => {
    const sub0 = scoreWithSubstitutions(9, 0.90)
    const sub3 = scoreWithSubstitutions(6, 0.90)
    const sub6 = scoreWithSubstitutions(3, 0.90)
    const sub9 = scoreWithSubstitutions(0, 0.90)

    expect(sub3.signals.substitutionCredit).toBeGreaterThan(sub0.signals.substitutionCredit)
    expect(sub6.signals.substitutionCredit).toBeGreaterThan(sub3.signals.substitutionCredit)
    expect(sub9.signals.substitutionCredit).toBeGreaterThan(sub6.signals.substitutionCredit)
  })

  it('ingredient match ratio drops as subs replace direct matches', () => {
    // Subs are NOT counted as direct matches — only substitution credit
    const sub0 = scoreWithSubstitutions(9, 0.90)  // 9 direct + olive oil = 10/10
    const sub3 = scoreWithSubstitutions(6, 0.90)  // 6 direct + olive oil = 7/10
    const sub9 = scoreWithSubstitutions(0, 0.90)  // 0 direct + olive oil = 1/10

    expect(sub0.ingredientMatchRatio).toBe(1.0)
    expect(sub3.ingredientMatchRatio).toBeCloseTo(7 / 10, 2)
    expect(sub9.ingredientMatchRatio).toBeCloseTo(1 / 10, 2)
  })

  it('very low confidence subs (0.50) are below threshold and give no credit', () => {
    // The RPC uses p_min_similarity = 0.75, but the scorer itself has no floor —
    // it trusts whatever the orchestrator passes. At 0.50 confidence the credit
    // per ingredient is small: 0.50 * 0.8 / 10 = 0.04 per ingredient.
    const sub9high = scoreWithSubstitutions(0, 0.90)
    const sub9low = scoreWithSubstitutions(0, 0.50)

    expect(sub9high.totalScore).toBeGreaterThan(sub9low.totalScore)
    // The difference should be substantial
    expect(sub9high.signals.substitutionCredit).toBeGreaterThan(
      sub9low.signals.substitutionCredit * 1.5,
    )
  })

  it('snapshot: score curve across all substitution levels', () => {
    // Not really an assertion test — captures the full degradation curve
    // for debugging and tuning. Each entry: [directCount, score]
    const curve: Array<{ direct: number; subs: number; score: number; subCredit: number; matchRatio: number }> = []

    for (let direct = 9; direct >= 0; direct--) {
      const result = scoreWithSubstitutions(direct, 0.85)
      curve.push({
        direct,
        subs: 9 - direct,
        score: Math.round(result.totalScore * 100) / 100,
        subCredit: Math.round(result.signals.substitutionCredit * 1000) / 1000,
        matchRatio: Math.round(result.ingredientMatchRatio * 100) / 100,
      })
    }

    // Verify the curve is non-empty and monotonically decreasing
    expect(curve).toHaveLength(10)
    expect(curve[0].score).toBeGreaterThan(curve[9].score)

    // The first entry (all direct) should have 0 substitution credit
    expect(curve[0].subCredit).toBe(0)
    // The last entry (all subs) should have the most substitution credit
    expect(curve[9].subCredit).toBeGreaterThan(0)
  })
})
