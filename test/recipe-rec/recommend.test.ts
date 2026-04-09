import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PantrySnapshot,
  RecipeCandidate,
  CandidateIngredient,
  UserPreferences,
  UserHistory,
  EmbeddingSubstitution,
} from '@/lib/recipe-rec/types'

// ---------------------------------------------------------------------------
// Mock the data-loader module — we test the orchestrator's logic, not DB calls
// ---------------------------------------------------------------------------

const mockLoadPantrySnapshot = vi.fn()
const mockLoadCandidateRecipes = vi.fn()
const mockLoadUserPreferences = vi.fn()
const mockLoadUserHistory = vi.fn()
const mockLoadEmbeddingSubstitutions = vi.fn()

vi.mock('@/lib/recipe-rec/data-loader', () => ({
  loadPantrySnapshot: (...args: any[]) => mockLoadPantrySnapshot(...args),
  loadCandidateRecipes: (...args: any[]) => mockLoadCandidateRecipes(...args),
  loadUserPreferences: (...args: any[]) => mockLoadUserPreferences(...args),
  loadUserHistory: (...args: any[]) => mockLoadUserHistory(...args),
  loadEmbeddingSubstitutions: (...args: any[]) => mockLoadEmbeddingSubstitutions(...args),
}))

import { getRecommendations } from '@/lib/recipe-rec/recommend'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function ing(id: string, name: string, category = 'other'): CandidateIngredient {
  return { standardizedIngredientId: id, canonicalName: name, category, quantity: 1, unit: 'each', displayName: name }
}

function makeCandidate(id: string, title: string, ingredients: CandidateIngredient[], overrides: Partial<RecipeCandidate> = {}): RecipeCandidate {
  return {
    recipeId: id,
    title,
    cuisine: 'american',
    mealType: 'dinner',
    difficulty: 'beginner',
    prepTime: 15,
    cookTime: 20,
    tags: [],
    ratingAvg: 4.0,
    ratingCount: 20,
    requiredIngredients: ingredients,
    optionalIngredients: [],
    ...overrides,
  }
}

function makePantry(ids: string[]): PantrySnapshot {
  const items = ids.map(id => ({
    standardizedIngredientId: id,
    name: `item-${id}`,
    quantity: 10 as number | null,
    unit: null as string | null,
    category: 'other',
    expiryDate: null as string | null,
  }))
  return {
    items,
    ingredientIds: new Set(ids),
    itemsByIngredientId: new Map(items.map(i => [i.standardizedIngredientId, i])),
    expiringWithin7Days: new Set(),
  }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadUserPreferences.mockResolvedValue(defaultPrefs)
    mockLoadUserHistory.mockResolvedValue(defaultHistory)
    mockLoadEmbeddingSubstitutions.mockResolvedValue(new Map())
  })

  it('returns scored and sorted recommendations', async () => {
    // 3 recipes. Pantry matches all of recipe A, some of B, none of C.
    const recipeA = makeCandidate('a', 'Full Match', [ing('i1', 'x'), ing('i2', 'y')])
    const recipeB = makeCandidate('b', 'Partial', [ing('i1', 'x'), ing('i3', 'z'), ing('i4', 'w')])
    const recipeC = makeCandidate('c', 'No Match', [ing('i5', 'q'), ing('i6', 'r')])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1', 'i2']))
    mockLoadCandidateRecipes.mockResolvedValue([recipeA, recipeB, recipeC])

    const results = await getRecommendations({ userId: 'user-1' })

    // Sorted descending by score
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].recipeId).toBe('a') // full match scores highest
    for (let i = 1; i < results.length; i++) {
      expect(results[i].totalScore).toBeLessThanOrEqual(results[i - 1].totalScore)
    }
  })

  it('filters out recipes below minMatchRatio', async () => {
    const recipeHigh = makeCandidate('h', 'High', [ing('i1', 'x'), ing('i2', 'y')]) // 2/2 = 1.0
    const recipeLow = makeCandidate('l', 'Low', [ing('i1', 'x'), ing('i3', 'z'), ing('i4', 'w'), ing('i5', 'v'), ing('i6', 'u')]) // 1/5 = 0.2

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1', 'i2']))
    mockLoadCandidateRecipes.mockResolvedValue([recipeHigh, recipeLow])

    const results = await getRecommendations({
      userId: 'user-1',
      filters: { minMatchRatio: 0.4 },
    })

    expect(results.some(r => r.recipeId === 'h')).toBe(true)
    expect(results.some(r => r.recipeId === 'l')).toBe(false) // 0.2 < 0.4
  })

  it('respects the limit parameter', async () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(`r-${i}`, `Recipe ${i}`, [ing(`i-${i}`, `ing-${i}`)])
    )

    // Pantry matches all of them
    mockLoadPantrySnapshot.mockResolvedValue(makePantry(candidates.map((_, i) => `i-${i}`)))
    mockLoadCandidateRecipes.mockResolvedValue(candidates)

    const results = await getRecommendations({ userId: 'user-1', limit: 5 })

    expect(results).toHaveLength(5)
  })

  it('returns empty array when no candidates', async () => {
    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([])

    const results = await getRecommendations({ userId: 'user-1' })

    expect(results).toEqual([])
  })

  it('loads all data in parallel (calls all loaders)', async () => {
    mockLoadPantrySnapshot.mockResolvedValue(makePantry([]))
    mockLoadCandidateRecipes.mockResolvedValue([])

    await getRecommendations({ userId: 'user-1' })

    expect(mockLoadPantrySnapshot).toHaveBeenCalledWith('user-1')
    expect(mockLoadCandidateRecipes).toHaveBeenCalledWith('user-1', expect.any(Object))
    expect(mockLoadUserPreferences).toHaveBeenCalledWith('user-1')
    expect(mockLoadUserHistory).toHaveBeenCalledWith('user-1', 7)
  })

  it('collects missing ingredient IDs and calls embedding substitutions', async () => {
    // Recipe needs i1, i2, i3. Pantry has i1 only. i2 and i3 are missing.
    // i2 is "garlic" (pantry staple), so only i3 should be sent for embedding subs.
    const recipe = makeCandidate('r', 'Test', [
      ing('i1', 'chicken', 'meat_seafood'),
      ing('i2', 'garlic', 'produce'),
      ing('i3', 'tarragon', 'produce'),
    ])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([recipe])

    await getRecommendations({ userId: 'user-1' })

    // Should call embedding subs with missing non-staple IDs
    expect(mockLoadEmbeddingSubstitutions).toHaveBeenCalledWith(
      expect.arrayContaining(['i3']),
      expect.arrayContaining(['i1']),
    )
    // garlic is a pantry staple — should NOT be in the missing IDs
    const missingArg = mockLoadEmbeddingSubstitutions.mock.calls[0][0]
    expect(missingArg).not.toContain('i2')
  })

  it('passes embedding substitutions to scorer and they affect scores', async () => {
    // Recipe needs i1 + i2. Pantry has i1 only. i2 ("saffron") is missing and not a staple.
    const recipe = makeCandidate('r', 'Saffron Rice', [
      ing('i1', 'rice', 'pantry_staples'),
      ing('i2', 'saffron', 'spices'),
    ])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([recipe])

    // First run: no embedding subs
    mockLoadEmbeddingSubstitutions.mockResolvedValueOnce(new Map())
    const withoutSubs = await getRecommendations({ userId: 'user-1', filters: { minMatchRatio: 0.1 } })

    // Second run: embedding sub for saffron → turmeric at 0.85
    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([recipe])
    mockLoadEmbeddingSubstitutions.mockResolvedValueOnce(
      new Map([['i2', { substituteName: 'turmeric', similarity: 0.85 }]])
    )
    const withSubs = await getRecommendations({ userId: 'user-1', filters: { minMatchRatio: 0.1 } })

    expect(withSubs[0].signals.substitutionCredit).toBeGreaterThan(
      withoutSubs[0].signals.substitutionCredit
    )
  })

  it('applies default weights when none provided', async () => {
    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([
      makeCandidate('r', 'Test', [ing('i1', 'x')]),
    ])

    const results = await getRecommendations({ userId: 'user-1' })

    // Should get a result without crashing — defaults applied
    expect(results).toHaveLength(1)
    expect(results[0].totalScore).toBeGreaterThan(0)
  })

  it('uses custom weights when provided', async () => {
    const recipe = makeCandidate('r', 'Test', [ing('i1', 'x'), ing('i2', 'y')])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([recipe])

    // All weight on ingredient match
    const results = await getRecommendations({
      userId: 'user-1',
      weights: {
        ingredientMatch: 1.0,
        quantitySufficiency: 0,
        expiryUrgency: 0,
        pantryStaple: 0,
        substitution: 0,
        preference: 0,
        popularity: 0,
        diversity: 0,
      },
      filters: { minMatchRatio: 0.1 },
    })

    // 1/2 match = 0.5 * 100 = 50
    expect(results[0].totalScore).toBeCloseTo(50, 0)
  })

  it('preference-aligned recipes rank higher', async () => {
    const italian = makeCandidate('it', 'Pasta', [ing('i1', 'x')], { cuisine: 'italian' })
    const thai = makeCandidate('th', 'Curry', [ing('i1', 'x')], { cuisine: 'thai' })

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([italian, thai])
    mockLoadUserPreferences.mockResolvedValue({
      ...defaultPrefs,
      cuisinePreferences: ['italian'],
    })

    const results = await getRecommendations({ userId: 'user-1' })

    const itScore = results.find(r => r.recipeId === 'it')!
    const thScore = results.find(r => r.recipeId === 'th')!
    expect(itScore.totalScore).toBeGreaterThan(thScore.totalScore)
  })

  it('recently-cooked recipes rank lower due to diversity penalty', async () => {
    const recipeA = makeCandidate('a', 'Stew', [ing('i1', 'x')])
    const recipeB = makeCandidate('b', 'Soup', [ing('i1', 'x')])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['i1']))
    mockLoadCandidateRecipes.mockResolvedValue([recipeA, recipeB])
    mockLoadUserHistory.mockResolvedValue({
      ...defaultHistory,
      recentRecipeIds: new Set(['a']), // Stew was cooked recently
    })

    const results = await getRecommendations({ userId: 'user-1' })

    const aScore = results.find(r => r.recipeId === 'a')!
    const bScore = results.find(r => r.recipeId === 'b')!
    expect(bScore.totalScore).toBeGreaterThan(aScore.totalScore)
  })

  it('filters are passed through to loadCandidateRecipes', async () => {
    mockLoadPantrySnapshot.mockResolvedValue(makePantry([]))
    mockLoadCandidateRecipes.mockResolvedValue([])

    await getRecommendations({
      userId: 'user-1',
      filters: {
        cuisines: ['italian' as any],
        mealTypes: ['dinner' as any],
        maxPrepMinutes: 30,
        maxDifficulty: 'beginner',
        dietaryTags: ['vegetarian' as any],
        minMatchRatio: 0.5,
      },
    })

    expect(mockLoadCandidateRecipes).toHaveBeenCalledWith('user-1', expect.objectContaining({
      cuisines: ['italian'],
      mealTypes: ['dinner'],
      maxPrepMinutes: 30,
      maxDifficulty: 'beginner',
      dietaryTags: ['vegetarian'],
      minMatchRatio: 0.5,
    }))
  })

  it('end-to-end: multiple recipes with varied match levels produce correct ranking', async () => {
    const full = makeCandidate('full', 'Full Match', [ing('a', 'x'), ing('b', 'y')])
    const half = makeCandidate('half', 'Half Match', [ing('a', 'x'), ing('c', 'z')])
    const third = makeCandidate('third', 'Third Match', [ing('a', 'x'), ing('d', 'w'), ing('e', 'v')])
    const none = makeCandidate('none', 'No Match', [ing('f', 'q'), ing('g', 'r')])

    mockLoadPantrySnapshot.mockResolvedValue(makePantry(['a', 'b']))
    mockLoadCandidateRecipes.mockResolvedValue([full, half, third, none])

    const results = await getRecommendations({
      userId: 'user-1',
      filters: { minMatchRatio: 0.3 },
    })

    // full (2/2=1.0) > half (1/2=0.5) > third (1/3=0.33)
    // none (0/2=0.0) filtered out by minMatchRatio
    const ids = results.map(r => r.recipeId)
    expect(ids[0]).toBe('full')
    expect(ids[1]).toBe('half')
    expect(ids[2]).toBe('third')
    expect(ids).not.toContain('none')
  })
})
