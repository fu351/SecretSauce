import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase client — must be hoisted before any imports that use it
// ---------------------------------------------------------------------------

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/database/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}))

vi.mock('@/lib/database/profile-db', () => ({
  profileDB: {
    findById: vi.fn(),
  },
}))

vi.mock('@/lib/database/recipe-favorites-db', () => ({
  recipeFavoritesDB: {},
}))

import {
  loadPantrySnapshot,
  loadCandidateRecipes,
  loadUserPreferences,
  loadUserHistory,
  loadEmbeddingSubstitutions,
} from '@/lib/recipe-rec/data-loader'
import { profileDB } from '@/lib/database/profile-db'

// ---------------------------------------------------------------------------
// Chain builder helpers — mirror the Supabase query builder chain
// ---------------------------------------------------------------------------

/** Terminates at the awaited query (no .single/.maybeSingle needed for .from().select()...) */
function selectChain(data: any[], error: any = null) {
  const terminal = { data, error }
  // Build from the inside out. Every chained method returns `this` until awaited.
  const chain: Record<string, any> = {}
  const self = () => chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.contains = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  // When the chain is awaited, return the terminal
  chain.then = vi.fn((resolve: any) => resolve(terminal))
  return chain
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadPantrySnapshot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns items, ingredientIds set, and itemsByIngredientId map', async () => {
    const rows = [
      { standardized_ingredient_id: 'id-1', name: 'chicken', quantity: 2, unit: 'lb', category: 'meat_seafood', expiry_date: null },
      { standardized_ingredient_id: 'id-2', name: 'rice', quantity: 3, unit: 'cup', category: 'pantry_staples', expiry_date: null },
    ]
    mockFrom.mockReturnValueOnce(selectChain(rows))

    const snap = await loadPantrySnapshot('user-1')

    expect(snap.items).toHaveLength(2)
    expect(snap.ingredientIds.has('id-1')).toBe(true)
    expect(snap.ingredientIds.has('id-2')).toBe(true)
    expect(snap.itemsByIngredientId.get('id-1')?.name).toBe('chicken')
    expect(snap.expiringWithin7Days.size).toBe(0)
  })

  it('identifies items expiring within 7 days', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
    const rows = [
      { standardized_ingredient_id: 'id-1', name: 'milk', quantity: 1, unit: 'gal', category: 'dairy', expiry_date: soon },
    ]
    mockFrom.mockReturnValueOnce(selectChain(rows))

    const snap = await loadPantrySnapshot('user-1')

    expect(snap.expiringWithin7Days.has('id-1')).toBe(true)
  })

  it('excludes items with no standardized_ingredient_id', async () => {
    const rows = [
      { standardized_ingredient_id: null, name: 'mystery item', quantity: 1, unit: null, category: null, expiry_date: null },
      { standardized_ingredient_id: 'id-1', name: 'salt', quantity: 1, unit: 'tsp', category: 'spices', expiry_date: null },
    ]
    mockFrom.mockReturnValueOnce(selectChain(rows))

    const snap = await loadPantrySnapshot('user-1')

    expect(snap.items).toHaveLength(1)
    expect(snap.ingredientIds.size).toBe(1)
  })

  it('returns empty snapshot on error', async () => {
    mockFrom.mockReturnValueOnce(selectChain(null, { message: 'DB down' }))

    const snap = await loadPantrySnapshot('user-1')

    expect(snap.items).toHaveLength(0)
    expect(snap.ingredientIds.size).toBe(0)
  })
})

describe('loadCandidateRecipes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls RPC pre-filter then loads full recipe data', async () => {
    // RPC returns candidate IDs
    mockRpc.mockResolvedValueOnce({
      data: [{ recipe_id: 'r-1' }, { recipe_id: 'r-2' }],
      error: null,
    })

    // Recipe data load
    const recipeRows = [
      { id: 'r-1', title: 'Pasta', cuisine: 'italian', meal_type: 'dinner', difficulty: 'beginner', prep_time: 10, cook_time: 15, tags: ['vegetarian'], rating_avg: 4.5, rating_count: 20 },
      { id: 'r-2', title: 'Salad', cuisine: 'american', meal_type: 'lunch', difficulty: 'beginner', prep_time: 5, cook_time: 0, tags: ['vegan'], rating_avg: 3.8, rating_count: 10 },
    ]
    mockFrom.mockReturnValueOnce(selectChain(recipeRows))

    // Ingredient load
    const ingredientRows = [
      { recipe_id: 'r-1', display_name: 'pasta', quantity: '1', units: 'lb', standardized_ingredient_id: 'ing-1', standardized_ingredients: { id: 'ing-1', canonical_name: 'pasta', category: 'pantry_staples' } },
      { recipe_id: 'r-2', display_name: 'lettuce', quantity: '2', units: 'cup', standardized_ingredient_id: 'ing-2', standardized_ingredients: { id: 'ing-2', canonical_name: 'lettuce', category: 'produce' } },
    ]
    mockFrom.mockReturnValueOnce(selectChain(ingredientRows))

    const candidates = await loadCandidateRecipes('user-1', { minMatchRatio: 0.4 })

    expect(mockRpc).toHaveBeenCalledWith('fn_recipe_candidates_for_pantry', {
      p_user_id: 'user-1',
      p_min_match_ratio: 0.4,
    })
    expect(candidates).toHaveLength(2)
    expect(candidates[0].title).toBe('Pasta')
    expect(candidates[0].cuisine).toBe('italian')
    expect(candidates[0].requiredIngredients[0].canonicalName).toBe('pasta')
    expect(candidates[1].title).toBe('Salad')
  })

  it('returns empty array when RPC returns no candidates', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const candidates = await loadCandidateRecipes('user-1', { minMatchRatio: 0.4 })

    expect(candidates).toHaveLength(0)
  })

  it('falls back to full load when RPC fails', async () => {
    // RPC fails
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'function not found' } })

    // Fallback: full recipe load
    const recipeRows = [
      { id: 'r-1', title: 'Soup', cuisine: 'french', meal_type: 'dinner', difficulty: 'beginner', prep_time: 15, cook_time: 30, tags: [], rating_avg: 4.0, rating_count: 5 },
    ]
    mockFrom.mockReturnValueOnce(selectChain(recipeRows))

    // Ingredient load
    const ingredientRows = [
      { recipe_id: 'r-1', display_name: 'onion', quantity: '1', units: 'each', standardized_ingredient_id: 'ing-1', standardized_ingredients: { id: 'ing-1', canonical_name: 'onion', category: 'produce' } },
    ]
    mockFrom.mockReturnValueOnce(selectChain(ingredientRows))

    const candidates = await loadCandidateRecipes('user-1', { minMatchRatio: 0.4 })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].title).toBe('Soup')
  })

  it('skips ingredients without standardized_ingredients join data', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ recipe_id: 'r-1' }], error: null })

    mockFrom.mockReturnValueOnce(selectChain([
      { id: 'r-1', title: 'Test', cuisine: null, meal_type: null, difficulty: null, prep_time: null, cook_time: null, tags: [], rating_avg: null, rating_count: null },
    ]))

    mockFrom.mockReturnValueOnce(selectChain([
      { recipe_id: 'r-1', display_name: 'good', quantity: '1', units: 'cup', standardized_ingredient_id: 'ing-1', standardized_ingredients: { id: 'ing-1', canonical_name: 'good', category: 'other' } },
      { recipe_id: 'r-1', display_name: 'bad', quantity: '1', units: 'cup', standardized_ingredient_id: null, standardized_ingredients: null },
    ]))

    const candidates = await loadCandidateRecipes('user-1', {})

    expect(candidates[0].requiredIngredients).toHaveLength(1)
    expect(candidates[0].requiredIngredients[0].canonicalName).toBe('good')
  })
})

describe('loadUserPreferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns preferences from profile', async () => {
    vi.mocked(profileDB.findById).mockResolvedValueOnce({
      dietary_preferences: ['vegetarian', 'gluten-free'],
      cuisine_preferences: ['italian', 'mexican'],
      cooking_time_preference: 'quick',
      budget_range: 'medium',
    } as any)

    const prefs = await loadUserPreferences('user-1')

    expect(prefs.dietaryPreferences).toEqual(['vegetarian', 'gluten-free'])
    expect(prefs.cuisinePreferences).toEqual(['italian', 'mexican'])
    expect(prefs.cookingTimePreference).toBe('quick')
    expect(prefs.budgetRange).toBe('medium')
  })

  it('returns empty arrays when profile has no preferences', async () => {
    vi.mocked(profileDB.findById).mockResolvedValueOnce({
      dietary_preferences: null,
      cuisine_preferences: null,
      cooking_time_preference: null,
      budget_range: null,
    } as any)

    const prefs = await loadUserPreferences('user-1')

    expect(prefs.dietaryPreferences).toEqual([])
    expect(prefs.cuisinePreferences).toEqual([])
    expect(prefs.cookingTimePreference).toBeNull()
  })

  it('returns empty arrays when profile is null', async () => {
    vi.mocked(profileDB.findById).mockResolvedValueOnce(null)

    const prefs = await loadUserPreferences('user-1')

    expect(prefs.dietaryPreferences).toEqual([])
    expect(prefs.cuisinePreferences).toEqual([])
  })
})

describe('loadUserHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads recent recipes, cuisines, and builds cuisine count map', async () => {
    // meal_schedule query
    mockFrom.mockReturnValueOnce(selectChain([
      { recipe_id: 'r-1', date: '2026-04-07' },
      { recipe_id: 'r-2', date: '2026-04-06' },
      { recipe_id: 'r-1', date: '2026-04-05' }, // same recipe again
    ]))

    // cuisine lookup for recent recipes
    mockFrom.mockReturnValueOnce(selectChain([
      { cuisine: 'italian' },
      { cuisine: 'italian' },
    ]))

    // favorites query
    mockFrom.mockReturnValueOnce(selectChain([
      { recipe_id: 'r-3' },
    ]))

    const history = await loadUserHistory('user-1', 7)

    expect(history.recentRecipeIds.has('r-1')).toBe(true)
    expect(history.recentRecipeIds.has('r-2')).toBe(true)
    expect(history.recentRecipeIds.size).toBe(2) // deduplicated
    expect(history.recentCuisines).toEqual(['italian', 'italian'])
    expect(history.recentCuisineCounts.get('italian')).toBe(2)
    expect(history.favoriteRecipeIds.has('r-3')).toBe(true)
  })

  it('handles empty schedule gracefully', async () => {
    mockFrom.mockReturnValueOnce(selectChain([]))   // no schedule
    mockFrom.mockReturnValueOnce(selectChain([]))   // no favorites

    const history = await loadUserHistory('user-1', 7)

    expect(history.recentRecipeIds.size).toBe(0)
    expect(history.recentCuisines).toEqual([])
    expect(history.recentCuisineCounts.size).toBe(0)
  })
})

describe('loadEmbeddingSubstitutions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns substitution map from RPC results', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { missing_ingredient_id: 'miss-1', missing_name: 'brown sugar', substitute_ingredient_id: 'sub-1', substitute_name: 'sugar', similarity: 0.93 },
        { missing_ingredient_id: 'miss-2', missing_name: 'lemon', substitute_ingredient_id: 'sub-2', substitute_name: 'lime', similarity: 0.88 },
      ],
      error: null,
    })

    const subs = await loadEmbeddingSubstitutions(['miss-1', 'miss-2'], ['sub-1', 'sub-2'])

    expect(subs.size).toBe(2)
    expect(subs.get('miss-1')).toEqual({ substituteName: 'sugar', similarity: 0.93 })
    expect(subs.get('miss-2')).toEqual({ substituteName: 'lime', similarity: 0.88 })

    expect(mockRpc).toHaveBeenCalledWith('fn_find_similar_ingredients_for_pantry', {
      p_missing_ids: ['miss-1', 'miss-2'],
      p_pantry_ids: ['sub-1', 'sub-2'],
      p_min_similarity: 0.75,
      p_model: 'nomic-embed-text',
    })
  })

  it('returns empty map when no missing IDs', async () => {
    const subs = await loadEmbeddingSubstitutions([], ['sub-1'])

    expect(subs.size).toBe(0)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns empty map when no pantry IDs', async () => {
    const subs = await loadEmbeddingSubstitutions(['miss-1'], [])

    expect(subs.size).toBe(0)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns empty map on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const subs = await loadEmbeddingSubstitutions(['miss-1'], ['sub-1'])

    expect(subs.size).toBe(0)
  })
})
