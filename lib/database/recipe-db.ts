
import { options } from "happy-dom/lib/PropertySymbol"
import { BaseTable } from "./base-db"
import { Recipe, parseInstructionsFromDB } from "@/lib/types"

/**
 * Database operations for recipes
 * Singleton class extending BaseTable with specialized recipe operations
 *
 * IMPORTANT: This table uses soft delete - all queries filter by deleted_at IS NULL
 * NOTE: Uses Recipe type instead of RecipeRow for application-level abstraction
 */
class RecipeTable extends BaseTable<"recipes", Recipe, Partial<Recipe>, Partial<Recipe>> {
  private static instance: RecipeTable | null = null
  readonly tableName = "recipes" as const

  private constructor() {
    super()
  }

  static getInstance(): RecipeTable {
    if (!RecipeTable.instance) {
      RecipeTable.instance = new RecipeTable()
    }
    return RecipeTable.instance
  }

  /**
   * Map raw database recipe to typed Recipe
   * Handles complex transformation from DB schema (JSONB content, enum arrays) to Recipe type
   */
  protected map(dbItem: any): Recipe {
    // Extract content JSONB
    const content = dbItem.content || {}

    return {
      id: dbItem.id,
      title: dbItem.title,
      prep_time: dbItem.prep_time || 0,
      cook_time: dbItem.cook_time || 0,
      servings: dbItem.servings,
      difficulty: dbItem.difficulty,
      cuisine_name: dbItem.cuisine || undefined, // Map enum directly to string
      ingredients: dbItem.ingredients || [],
      nutrition: dbItem.nutrition || {},
      author_id: dbItem.author_id || "",
      rating_avg: dbItem.rating_avg || 0,
      rating_count: dbItem.rating_count || 0,

      content: {
        description: content.description || "",
        image_url: content.image_url,
        instructions: parseInstructionsFromDB(content.instructions),
      },

      // UNIFIED TAG SYSTEM - tags array contains dietary and allergen tags
      tags: dbItem.tags || [],
      protein: dbItem.protein || undefined,
      meal_type: dbItem.meal_type || undefined,
      cuisine_guess: undefined,

      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at,
    }
  }

  /**
   * Override findById to filter soft-deleted recipes
   */
  async findById(id: string): Promise<Recipe | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null) // Filter soft-deleted recipes
      .single()

    if (error) {
      this.handleError(error, `findById(${id})`)
      return null
    }

    return data ? this.map(data) : null
  }

  /**
   * Alias for findById to maintain backwards compatibility
   */
  async fetchRecipeById(id: string): Promise<Recipe | null> {
    return this.findById(id)
  }
  
  async fetchRecipeByIds(ids: string[]): Promise<Recipe[]> {
    if (ids.length === 0) return [];
    return this.findByIds(ids);
  }

  /**
   * Fetch all recipes with optional filtering and sorting
   * Replaces BaseTable's findAll() with advanced filtering capabilities
   */
  async fetchRecipes(options?: {
    sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
    difficulty?: string
    cuisine?: string
    authorId?: string
    tags?: string[]
    protein?: string
    mealType?: string
    favoriteIds?: string[]
    limit?: number
    offset?: number
  }): Promise<Recipe[]> {
    const {
      sortBy = "created_at",
      difficulty,
      cuisine,
      authorId,
      tags,
      protein,
      mealType,
      favoriteIds,
      limit = 50,
      offset = 0,
    } = options || {}

    let query = this.supabase
      .from(this.tableName)
      .select("*")
      .is("deleted_at", null) // Filter soft-deleted recipes

    // Apply filters
    if (difficulty) {
      query = query.eq("difficulty", difficulty)
    }

    if (cuisine) {
      query = query.eq("cuisine", cuisine)
    }

    if (authorId) {
      query = query.eq("author_id", authorId)
    }

    // Apply tags filter (uses GIN index on tags_enum[] array)
    if (tags && tags.length > 0) {
      query = query.contains("tags", tags)
    }

    // Apply protein filter (uses B-tree index on enum)
    if (protein) {
      query = query.eq("protein", protein)
    }

    // Apply meal_type filter (uses B-tree index on enum)
    if (mealType) {
      query = query.eq("meal_type", mealType)
    }

    // Apply favorites filter (server-side filtering by recipe IDs)
    if (favoriteIds && favoriteIds.length > 0) {
      query = query.in("id", favoriteIds)
    }

    // Apply sorting (uses B-tree indexes)
    if (sortBy === "created_at") {
      query = query.order("created_at", { ascending: false })
    } else if (sortBy === "rating_avg") {
      query = query.order("rating_avg", { ascending: false, nullsFirst: false })
    } else if (sortBy === "prep_time") {
      query = query.order("prep_time", { ascending: true })
    } else if (sortBy === "title") {
      query = query.order("title", { ascending: true })
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) {
      this.handleError(error, "fetchRecipes")
      return []
    }

    return (data || []).map((item) => this.map(item))
  }

  /**
   * Fetch recipes by author
   */
  async fetchRecipesByAuthor(
    authorId: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> {
    return this.fetchRecipes({
      ...options,
      authorId,
    })
  }

  /**
   * Fetch recipes by cuisine
   */
  async fetchRecipesByCuisine(
    cuisine: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> {
    return this.fetchRecipes({
      ...options,
      cuisine,
    })
  }

  /**
   * Fetch recipes by difficulty level
   */
  async fetchRecipesByDifficulty(
    difficulty: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> {
    return this.fetchRecipes({
      ...options,
      difficulty,
    })
  }

  /**
   * Fetch recipes by tags
   */
  async fetchRecipesByTags(
    tags: string[],
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> {
    return this.fetchRecipes({
      ...options,
      tags,
    })
  }

  /**
   * Insert a new recipe
   * Transforms Recipe type to DB schema with JSONB content field
   */
  async insertRecipe(recipe: Partial<Recipe>): Promise<Recipe | null> {
    console.log("[Recipe DB] Attempting to insert recipe:", recipe)

    // Transform Recipe type to DB schema
    const dbRecipe = {
      // Direct mappings
      title: recipe.title,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      ingredients: recipe.ingredients,
      nutrition: recipe.nutrition,
      author_id: recipe.author_id,
      rating_avg: recipe.rating_avg,
      rating_count: recipe.rating_count,

      // Build content JSONB
      content: {
        description: recipe.content?.description || "",
        image_url: recipe.content?.image_url || null,
        instructions: recipe.content?.instructions || [],
      },

      // Map tags array (dietary and allergen tags consolidated)
      tags: recipe.tags || [],

      // Map enum fields
      protein: recipe.protein || null,
      meal_type: recipe.meal_type || null,
      cuisine: recipe.cuisine_name || "other",

      // Soft delete defaults
      deleted_at: null,
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(dbRecipe as any)
      .select("*")
      .single()

    if (error) {
      this.handleError(error, "insertRecipe")
      return null
    }

    console.log("[Recipe DB] Insert successful, returned data:", data)
    return data ? this.map(data) : null
  }

  /**
   * Alias for insertRecipe (uses BaseTable's create pattern)
   */
  async create(insertData: Partial<Recipe>): Promise<Recipe | null> {
    return this.insertRecipe(insertData)
  }

  /**
   * Update an existing recipe
   * Handles complex partial updates with JSONB content merging
   */
  async updateRecipe(id: string, updates: Partial<Recipe>): Promise<Recipe | null> {
    console.log("[Recipe DB] Attempting to update recipe:", id, updates)

    // Transform Recipe type to DB schema (only for provided fields)
    const dbUpdates: any = {}

    // Direct mappings
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.prep_time !== undefined) dbUpdates.prep_time = updates.prep_time
    if (updates.cook_time !== undefined) dbUpdates.cook_time = updates.cook_time
    if (updates.servings !== undefined) dbUpdates.servings = updates.servings
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty
    if (updates.ingredients !== undefined) dbUpdates.ingredients = updates.ingredients
    if (updates.nutrition !== undefined) dbUpdates.nutrition = updates.nutrition
    if (updates.rating_avg !== undefined) dbUpdates.rating_avg = updates.rating_avg
    if (updates.rating_count !== undefined) dbUpdates.rating_count = updates.rating_count

    // Build content JSONB if any content fields are updated
    if (updates.content) {
      // Fetch current content first if partial update
      const { data: currentRecipe } = await (this.supabase.from(this.tableName) as any)
        .select("content")
        .eq("id", id)
        .single()

      const currentContent = (currentRecipe as any)?.content || {}

      dbUpdates.content = {
        description:
          updates.content.description !== undefined ? updates.content.description : currentContent.description,
        image_url: updates.content.image_url !== undefined ? updates.content.image_url : currentContent.image_url,
        instructions:
          updates.content.instructions !== undefined ? updates.content.instructions : currentContent.instructions,
      }
    }

    // Map tags if provided (dietary and allergen tags consolidated into tags array)
    if (updates.tags !== undefined) {
      dbUpdates.tags = updates.tags
    }

    if (updates.protein !== undefined) {
      dbUpdates.protein = updates.protein
    }

    if (updates.meal_type !== undefined) {
      dbUpdates.meal_type = updates.meal_type
    }

    // Map cuisine_name if provided
    if (updates.cuisine_name !== undefined) {
      dbUpdates.cuisine = updates.cuisine_name || "other"
    }

    const { data, error } = await (this.supabase.from(this.tableName) as any)
      .update(dbUpdates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single()

    if (error) {
      this.handleError(error, "updateRecipe")
      return null
    }

    console.log("[Recipe DB] Update successful, returned data:", data)
    return data ? this.map(data) : null
  }

  /**
   * Override update to use updateRecipe
   */
  async update(id: string, updateData: Partial<Recipe>): Promise<Recipe | null> {
    return this.updateRecipe(id, updateData)
  }

  /**
   * Delete a recipe (soft delete)
   * Sets deleted_at timestamp instead of removing the record
   */
  async deleteRecipe(id: string): Promise<boolean> {
    const { error } = await (this.supabase.from(this.tableName) as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)

    if (error) {
      this.handleError(error, `deleteRecipe(${id})`)
      return false
    }

    console.log("[Recipe DB] Soft delete successful for recipe:", id)
    return true
  }

  /**
   * Override remove to use soft delete
   */
  async remove(id: string): Promise<boolean> {
    return this.deleteRecipe(id)
  }

  /**
   * Update recipe rating
   */
  async updateRecipeRating(id: string, rating_avg: number, rating_count: number): Promise<Recipe | null> {
    return this.updateRecipe(id, {
      rating_avg,
      rating_count,
    })
  }

  /**
   * Batch update recipe ratings
   */
  async batchUpdateRatings(
    updates: Array<{ id: string; rating_avg: number; rating_count: number }>
  ): Promise<Recipe[]> {
    const results = await Promise.all(
      updates.map(({ id, rating_avg, rating_count }) => this.updateRecipeRating(id, rating_avg, rating_count))
    )
    return results.filter((recipe): recipe is Recipe => recipe !== null)
  }

  /**
   * Search recipes by title, description, or ingredients
   * Client-side filtering after fetching (Supabase lacks full-text search without custom functions)
   */
  async searchRecipes(
    query: string,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> {
    const { limit = 50, offset = 0 } = options || {}
    const searchQuery = query.toLowerCase()

    // Fetch recipes and filter client-side for flexible search
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .is("deleted_at", null)
      .range(offset, offset + limit - 1)

    if (error) {
      this.handleError(error, "searchRecipes")
      return []
    }

    return (data || [])
      .filter((recipe: any) => {
        const title = recipe.title?.toLowerCase() || ""

        // Search in content.description instead of direct description column
        const content = recipe.content || {}
        const description = content.description?.toLowerCase() || ""

        const matchesTitle = title.includes(searchQuery)
        const matchesDescription = description.includes(searchQuery)

        // Search ingredients by name
        const matchesIngredient =
          Array.isArray(recipe.ingredients) &&
          recipe.ingredients.some((ing: any) => ing.name?.toLowerCase().includes(searchQuery))

        return matchesTitle || matchesDescription || matchesIngredient
      })
      .map((item) => this.map(item))
  }

  /**
   * Fetch count of recipes matching filters
   * Used for pagination to calculate total pages
   */
  async fetchRecipesCount(options?: {
    difficulty?: string
    cuisine?: string
    search?: string
    diet?: string
    favoriteIds?: string[]
  }): Promise<number> {
    const { difficulty, cuisine, search, diet, favoriteIds } = options || {}

    let query = this.supabase
      .from(this.tableName)
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null) // Filter soft-deleted recipes

    // Apply same filters as fetchRecipes
    if (difficulty) {
      query = query.eq("difficulty", difficulty)
    }

    if (cuisine) {
      query = query.eq("cuisine", cuisine)
    }

    // Apply diet filter (tags array contains dietary tags)
    if (diet) {
      query = query.contains("tags", [diet])
    }

    // Apply favorites filter (server-side filtering by recipe IDs)
    if (favoriteIds && favoriteIds.length > 0) {
      query = query.in("id", favoriteIds)
    }

    // Note: search filter is applied client-side in searchRecipes,
    // so for count with search, we need a different approach
    // For now, if search is provided, we'll fetch and count client-side
    if (search) {
      const searchQuery = search.toLowerCase()
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .is("deleted_at", null)

      if (error) {
        this.handleError(error, "fetchRecipesCount (with search)")
        return 0
      }

      const filtered = (data || []).filter((recipe: any) => {
        const title = recipe.title?.toLowerCase() || ""
        const content = recipe.content || {}
        const description = content.description?.toLowerCase() || ""

        const matchesTitle = title.includes(searchQuery)
        const matchesDescription = description.includes(searchQuery)
        const matchesIngredient =
          Array.isArray(recipe.ingredients) &&
          recipe.ingredients.some((ing: any) => ing.name?.toLowerCase().includes(searchQuery))

        return matchesTitle || matchesDescription || matchesIngredient
      })

      return filtered.length
    }

    const { count, error } = await query

    if (error) {
      this.handleError(error, "fetchRecipesCount")
      return 0
    }

    return count || 0
  }

  async calculateCostEstimate(
    recipeId: string, 
    store: string,
    zip_code: string,
    servings: number
  ): Promise<{ totalCost: number; costPerServing: number; ingredients: Record<string, number> } | null> {

    console.log(`[Recipe DB] Calculating cost estimate for recipe ${recipeId} at store ${store} for ${servings} servings in zip ${zip_code}`)
    
    // Note: Parameter names must match the SQL function exactly (p_store_id vs p_store)
    const { data, error } = await this.supabase.rpc("calculate_recipe_cost", {
      p_recipe_id: recipeId,
      p_store_id: store,
      p_zip_code: zip_code,
      p_servings: servings
    } 
    Returns: {
      any
    });

    if (error) {
      this.handleError(error, "calculateCostEstimate");
      return null;
    }

    // data is the JSONB object: { totalCost: X, costPerServing: Y, ingredients: {...} }
    return data;
  }

  async calculateMultipleCostEstimates(
    recipeIds: string[],
    store: string,
    zip_code: string,
    servingsMap: Record<string, number>
  ): Promise<any> {
    // 1. Transform your servingsMap into the JSON structure the SQL function expects
    const recipeConfigs = recipeIds.map(id => ({
      id: id,
      servings: servingsMap[id] || 1
    }));

    // 2. Make ONE call to the batch function
    const { data, error } = await (this.supabase as any).rpc("calculate_weekly_basket", {
      p_recipe_configs: recipeConfigs,
      p_user_id: (await this.supabase.auth.getUser()).data.user?.id, // Assumes user is logged in
      p_store_id: store,
      p_zip_code: zip_code
    });

    if (error) {
      this.handleError(error, "calculateMultipleCostEstimates");
      return null;
    }

    return data;
  }
}

// Export singleton instance
export const recipeDB = RecipeTable.getInstance()
