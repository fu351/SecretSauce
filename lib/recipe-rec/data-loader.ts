import { supabase } from '@/lib/database/supabase'
import { profileDB } from '@/lib/database/profile-db'
import { recipeFavoritesDB } from '@/lib/database/recipe-favorites-db'
import type {
  PantrySnapshot,
  PantryItem,
  RecipeCandidate,
  CandidateIngredient,
  RecipeFilters,
  UserPreferences,
  EmbeddingSubstitution,
  UserHistory,
} from './types'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Safety cap for arrays passed to Supabase .in() clauses to avoid query timeouts. */
const MAX_IN_CLAUSE_SIZE = 2000

/**
 * Load the user's pantry as a snapshot with O(1) lookup sets.
 */
export async function loadPantrySnapshot(userId: string): Promise<PantrySnapshot> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('standardized_ingredient_id, name, quantity, unit, category, expiry_date')
    .eq('user_id', userId)
    .or(`expiry_date.is.null,expiry_date.gte.${new Date().toISOString()}`)

  if (error) {
    console.error('[recipe-rec] Failed to load pantry:', error.message)
    return { items: [], ingredientIds: new Set(), itemsByIngredientId: new Map(), expiringWithin7Days: new Set() }
  }

  const now = Date.now()
  const sevenDaysFromNow = now + SEVEN_DAYS_MS
  const items: PantryItem[] = []
  const ingredientIds = new Set<string>()
  const itemsByIngredientId = new Map<string, PantryItem>()
  const expiringWithin7Days = new Set<string>()

  for (const row of data ?? []) {
    if (!row.standardized_ingredient_id) continue

    const item: PantryItem = {
      standardizedIngredientId: row.standardized_ingredient_id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      category: row.category ?? 'other',
      expiryDate: row.expiry_date,
    }

    items.push(item)
    ingredientIds.add(row.standardized_ingredient_id)
    itemsByIngredientId.set(row.standardized_ingredient_id, item)

    if (row.expiry_date) {
      const expiry = new Date(row.expiry_date).getTime()
      if (expiry <= sevenDaysFromNow && expiry >= now) {
        expiringWithin7Days.add(row.standardized_ingredient_id)
      }
    }
  }

  return { items, ingredientIds, itemsByIngredientId, expiringWithin7Days }
}

/**
 * Use the SQL RPC function to pre-filter candidates by pantry overlap,
 * then load full recipe data only for matching candidates.
 */
export async function loadCandidateRecipes(
  userId: string,
  filters: RecipeFilters
): Promise<RecipeCandidate[]> {
  const minMatchRatio = filters.minMatchRatio ?? 0.4

  // Step 1: Pre-filter via RPC
  const { data: candidateIds, error: rpcError } = await supabase
    .rpc('fn_recipe_candidates_for_pantry', {
      p_user_id: userId,
      p_min_match_ratio: minMatchRatio,
    })

  if (rpcError) {
    console.error('[recipe-rec] RPC pre-filter failed, falling back to full load:', rpcError.message)
    return loadAllCandidateRecipes(filters)
  }

  if (!candidateIds || candidateIds.length === 0) return []

  const recipeIds = candidateIds.map((c: { recipe_id: string }) => c.recipe_id)

  return loadRecipesByIds(recipeIds, filters)
}

/**
 * Fallback: load all recipes matching filters (no pre-filtering).
 */
async function loadAllCandidateRecipes(filters: RecipeFilters): Promise<RecipeCandidate[]> {
  let query = supabase
    .from('recipes')
    .select('id, title, cuisine, meal_type, difficulty, prep_time, cook_time, tags, rating_avg, rating_count')
    .is('deleted_at', null)

  query = applyFilters(query, filters)

  const { data, error } = await query

  if (error || !data) {
    console.error('[recipe-rec] Failed to load candidate recipes:', error?.message)
    return []
  }

  return buildCandidates(data.map((r: any) => r.id), data)
}

/**
 * Load full recipe data for a set of pre-filtered IDs.
 */
async function loadRecipesByIds(
  recipeIds: string[],
  filters: RecipeFilters
): Promise<RecipeCandidate[]> {
  const cappedIds = recipeIds.slice(0, MAX_IN_CLAUSE_SIZE)
  let query = supabase
    .from('recipes')
    .select('id, title, cuisine, meal_type, difficulty, prep_time, cook_time, tags, rating_avg, rating_count')
    .in('id', cappedIds)
    .is('deleted_at', null)

  query = applyFilters(query, filters)

  const { data: recipes, error } = await query

  if (error || !recipes) {
    console.error('[recipe-rec] Failed to load recipes by IDs:', error?.message)
    return []
  }

  return buildCandidates(recipes.map((r: any) => r.id), recipes)
}

function applyFilters(query: any, filters: RecipeFilters) {
  if (filters.cuisines?.length) {
    query = query.in('cuisine', filters.cuisines)
  }
  if (filters.mealTypes?.length) {
    query = query.in('meal_type', filters.mealTypes)
  }
  if (filters.maxPrepMinutes) {
    query = query.lte('prep_time', filters.maxPrepMinutes)
  }
  if (filters.maxDifficulty) {
    const levels = ['beginner', 'intermediate', 'advanced']
    const maxIdx = levels.indexOf(filters.maxDifficulty)
    if (maxIdx >= 0) {
      query = query.in('difficulty', levels.slice(0, maxIdx + 1))
    }
  }
  if (filters.dietaryTags?.length) {
    for (const tag of filters.dietaryTags) {
      query = query.contains('tags', [tag])
    }
  }
  return query
}

/**
 * Load ingredients for a set of recipe IDs and assemble RecipeCandidate objects.
 */
async function buildCandidates(
  recipeIds: string[],
  recipeRows: any[]
): Promise<RecipeCandidate[]> {
  if (recipeIds.length === 0) return []

  const { data: ingredientRows, error } = await supabase
    .from('recipe_ingredients')
    .select(`
      recipe_id,
      display_name,
      quantity,
      units,
      standardized_ingredient_id,
      standardized_ingredients (
        id,
        canonical_name,
        category
      )
    `)
    .in('recipe_id', recipeIds)
    .is('deleted_at', null)

  if (error) {
    console.error('[recipe-rec] Failed to load recipe ingredients:', error.message)
    return []
  }

  // Group ingredients by recipe_id
  const ingredientsByRecipe = new Map<string, CandidateIngredient[]>()
  for (const row of ingredientRows ?? []) {
    const si = row.standardized_ingredients as any
    if (!si?.id) continue

    const ingredient: CandidateIngredient = {
      standardizedIngredientId: si.id,
      canonicalName: si.canonical_name ?? row.display_name,
      category: si.category ?? 'other',
      quantity: row.quantity,
      unit: row.units,
      displayName: row.display_name,
    }

    const list = ingredientsByRecipe.get(row.recipe_id) ?? []
    list.push(ingredient)
    ingredientsByRecipe.set(row.recipe_id, list)
  }

  // Build candidates
  const recipeMap = new Map(recipeRows.map((r: any) => [r.id, r]))

  return recipeIds
    .filter(id => ingredientsByRecipe.has(id))
    .map(id => {
      const r = recipeMap.get(id)!
      const ingredients = ingredientsByRecipe.get(id) ?? []

      return {
        recipeId: id,
        title: r.title,
        cuisine: r.cuisine ?? null,
        mealType: r.meal_type ?? null,
        difficulty: r.difficulty ?? null,
        prepTime: r.prep_time ?? null,
        cookTime: r.cook_time ?? null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        ratingAvg: r.rating_avg ?? null,
        ratingCount: r.rating_count ?? null,
        requiredIngredients: ingredients,
        optionalIngredients: [],
      }
    })
}

/**
 * Load user dietary/cuisine preferences from the profiles table.
 */
export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  const profile = await profileDB.findById(userId)

  return {
    dietaryPreferences: Array.isArray(profile?.dietary_preferences) ? profile.dietary_preferences : [],
    cuisinePreferences: Array.isArray(profile?.cuisine_preferences) ? profile.cuisine_preferences : [],
    cookingTimePreference: profile?.cooking_time_preference ?? null,
    budgetRange: profile?.budget_range ?? null,
  }
}

/**
 * Load recent cooking history and favorites for diversity scoring.
 */
export async function loadUserHistory(userId: string, dayRange = 7): Promise<UserHistory> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - dayRange)
  const startIso = startDate.toISOString().split('T')[0]
  const endIso = new Date().toISOString().split('T')[0]

  // Load recent meal schedule
  const { data: schedule } = await supabase
    .from('meal_schedule')
    .select('recipe_id, date')
    .eq('user_id', userId)
    .gte('date', startIso)
    .lte('date', endIso)

  const recentRecipeIds = new Set<string>()
  const recentCuisines: string[] = []

  for (const entry of schedule ?? []) {
    if (entry.recipe_id) recentRecipeIds.add(entry.recipe_id)
  }

  // If we have recent recipes, load their cuisines
  if (recentRecipeIds.size > 0) {
    const { data: recentRecipes } = await supabase
      .from('recipes')
      .select('cuisine')
      .in('id', Array.from(recentRecipeIds))

    for (const r of recentRecipes ?? []) {
      if (r.cuisine) recentCuisines.push(r.cuisine)
    }
  }

  // Build cuisine frequency map for O(1) lookup in diversity scoring
  const recentCuisineCounts = new Map<string, number>()
  for (const c of recentCuisines) {
    const key = c.toLowerCase()
    recentCuisineCounts.set(key, (recentCuisineCounts.get(key) ?? 0) + 1)
  }

  // Load favorites
  const { data: favorites } = await supabase
    .from('recipe_favorites')
    .select('recipe_id')
    .eq('user_id', userId)

  const favoriteRecipeIds = new Set<string>(
    (favorites ?? []).map((f: any) => f.recipe_id)
  )

  return { recentRecipeIds, recentCuisines, recentCuisineCounts, favoriteRecipeIds }
}

/**
 * Load embedding-based substitutions for missing ingredients.
 * Calls a single Postgres RPC that does the vector similarity search in SQL —
 * one round trip for all missing ingredients at once.
 *
 * Returns a Map keyed by missing ingredient ID → best substitute + similarity.
 */
export async function loadEmbeddingSubstitutions(
  missingIds: string[],
  pantryIds: string[],
  minSimilarity = 0.75,
): Promise<Map<string, EmbeddingSubstitution>> {
  const result = new Map<string, EmbeddingSubstitution>()

  if (missingIds.length === 0 || pantryIds.length === 0) return result

  const { data, error } = await supabase.rpc('fn_find_similar_ingredients_for_pantry', {
    p_missing_ids: missingIds,
    p_pantry_ids: pantryIds,
    p_min_similarity: minSimilarity,
    p_model: 'nomic-embed-text',
  })

  if (error) {
    console.error('[recipe-rec] Embedding substitution RPC failed:', error.message)
    return result
  }

  for (const row of data ?? []) {
    result.set(String(row.missing_ingredient_id), {
      substituteName: String(row.substitute_name),
      similarity: Number(row.similarity),
    })
  }

  return result
}
