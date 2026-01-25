
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"
import type { Recipe } from "@/lib/types"
import { parseInstructionsFromDB } from "@/lib/types"

export type RecipeFavoriteRow = Database["public"]["Tables"]["recipe_favorites"]["Row"]
export type RecipeFavoriteInsert = Database["public"]["Tables"]["recipe_favorites"]["Insert"]
export type RecipeFavoriteUpdate = Database["public"]["Tables"]["recipe_favorites"]["Update"]

/**
 * Database operations for recipe favorites
 * Singleton class extending BaseTable with specialized favorites operations
 */
class RecipeFavoritesTable extends BaseTable<
  "recipe_favorites",
  RecipeFavoriteRow,
  RecipeFavoriteInsert,
  RecipeFavoriteUpdate
> {
  private static instance: RecipeFavoritesTable | null = null
  readonly tableName = "recipe_favorites" as const

  private constructor() {
    super()
  }

  static getInstance(): RecipeFavoritesTable {
    if (!RecipeFavoritesTable.instance) {
      RecipeFavoritesTable.instance = new RecipeFavoritesTable()
    }
    return RecipeFavoritesTable.instance
  }

  /**
   * Fetch user's favorite recipes with full recipe data using relationship join
   */
  async fetchFavoriteRecipes(userId: string): Promise<Recipe[]> {
    console.log("[Recipe Favorites DB] Fetching favorite recipes for user:", userId)

    // Single batch query using relationship join - more efficient than two separate queries
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(`
        recipe_id,
        recipes (
          id,
          title,
          description,
          image_url,
          instructions_list,
          prep_time,
          cook_time,
          servings,
          difficulty,
          rating_avg,
          rating_count,
          author_id,
          tags,
          protein,
          meal_type,
          cuisine,
          nutrition,
          created_at,
          updated_at
        )
      `)
      .eq("user_id", userId)

    if (error) {
      // Table might not exist in test environment or foreign key relationship not configured
      if (error.code === "PGRST116" || error.code === "PGRST200" || error.message?.includes("relation")) {
        console.log("[Recipe Favorites DB] Favorites table not available or relationship not configured:", error.message)
        return []
      }
      this.handleError(error, "fetchFavoriteRecipes")
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Extract and map recipes from the joined result
    const recipes = data
      .map((item: any) => item.recipes)
      .filter(Boolean)
      .map((recipe: any) => {
        const description = recipe.description ?? recipe.content?.description ?? ""
        const imageUrl = recipe.image_url ?? recipe.content?.image_url
        const instructions = parseInstructionsFromDB(
          recipe.instructions_list ?? recipe.content?.instructions
        )

        return {
          id: recipe.id,
          title: recipe.title,
          description,
          image_url: imageUrl,
          prep_time: recipe.prep_time || 0,
          cook_time: recipe.cook_time || 0,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          cuisine_name: recipe.cuisine || undefined,
          ingredients: recipe.ingredients || [],
          instructions,
          nutrition: recipe.nutrition || {},
          author_id: recipe.author_id || "",
          rating_avg: recipe.rating_avg || 0,
          rating_count: recipe.rating_count || 0,
          tags: {
            dietary: recipe.tags || [],
            protein: recipe.protein || undefined,
            meal_type: recipe.meal_type || undefined,
            cuisine_guess: undefined,
          },
          created_at: recipe.created_at,
          updated_at: recipe.updated_at,
        }
      })

    return recipes
  }

  /**
   * Fetch just the favorite recipe IDs for a user (lightweight query)
   */
  async fetchFavoriteRecipeIds(userId: string): Promise<string[]> {
    console.log("[Recipe Favorites DB] Fetching favorite recipe IDs for user:", userId)

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("recipe_id")
      .eq("user_id", userId)

    if (error) {
      this.handleError(error, "fetchFavoriteRecipeIds")
      return []
    }

    return (data || []).map((item) => item.recipe_id)
  }

  /**
   * Check if a recipe is favorited by a user
   */
  async isFavorite(userId: string, recipeId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("id")
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)
      .maybeSingle()

    if (error) {
      this.handleError(error, "isFavorite")
      return false
    }

    return !!data
  }

  /**
   * Add a recipe to favorites
   */
  async addFavorite(userId: string, recipeId: string): Promise<RecipeFavoriteRow | null> {
    console.log("[Recipe Favorites DB] Adding favorite:", { userId, recipeId })

    // Use upsert to avoid duplicate key errors - it will insert or do nothing if exists
    const { data, error } = await (this.supabase
      .from(this.tableName) as any)
      .upsert(
        {
          user_id: userId,
          recipe_id: recipeId,
        },
        {
          onConflict: "recipe_id,user_id",
          ignoreDuplicates: true,
        }
      )
      .select()
      .maybeSingle()

    if (error) {
      this.handleError(error, "addFavorite")
      return null
    }

    console.log("[Recipe Favorites DB] Favorite added successfully")
    return data
  }

  /**
   * Remove a recipe from favorites
   */
  async removeFavorite(userId: string, recipeId: string): Promise<boolean> {
    console.log("[Recipe Favorites DB] Removing favorite:", { userId, recipeId })

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)

    if (error) {
      this.handleError(error, "removeFavorite")
      return false
    }

    console.log("[Recipe Favorites DB] Favorite removed successfully")
    return true
  }

  /**
   * Toggle favorite status for a recipe
   */
  async toggleFavorite(userId: string, recipeId: string): Promise<boolean> {
    const isCurrentlyFavorite = await this.isFavorite(userId, recipeId)

    if (isCurrentlyFavorite) {
      await this.removeFavorite(userId, recipeId)
      return false
    } else {
      await this.addFavorite(userId, recipeId)
      return true
    }
  }

  /**
   * Remove all favorites for a user
   */
  async clearAllFavorites(userId: string): Promise<boolean> {
    console.log("[Recipe Favorites DB] Clearing all favorites for user:", userId)

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("user_id", userId)

    if (error) {
      this.handleError(error, "clearAllFavorites")
      return false
    }

    console.log("[Recipe Favorites DB] All favorites cleared successfully")
    return true
  }
}

// Export singleton instance
export const recipeFavoritesDB = RecipeFavoritesTable.getInstance()
