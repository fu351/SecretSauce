"use client"

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

      // UNIFIED TAG SYSTEM - tags array contains both dietary and allergen tags
      tags: {
        dietary: dbItem.tags || [],
        protein: dbItem.protein || undefined,
        meal_type: dbItem.meal_type || undefined,
        cuisine_guess: undefined,
      },

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
      tags: recipe.tags?.dietary || [],

      // Map enum fields
      protein: recipe.tags?.protein || null,
      meal_type: recipe.tags?.meal_type || null,
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
    if (updates.tags) {
      if (updates.tags.dietary !== undefined) {
        dbUpdates.tags = updates.tags.dietary
      }

      if (updates.tags.protein !== undefined) {
        dbUpdates.protein = updates.tags.protein
      }

      if (updates.tags.meal_type !== undefined) {
        dbUpdates.meal_type = updates.tags.meal_type
      }
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
}

// Export singleton instance
export const recipeDB = RecipeTable.getInstance()
