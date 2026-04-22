
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"
import type { Recipe } from "@/lib/types"
import { parseInstructionsFromDB } from "@/lib/types"

export type RecipeCollectionRow = Database["public"]["Tables"]["recipe_collections"]["Row"]
export type RecipeCollectionInsert = Database["public"]["Tables"]["recipe_collections"]["Insert"]
export type RecipeCollectionUpdate = Database["public"]["Tables"]["recipe_collections"]["Update"]

export type RecipeCollectionItemRow = Database["public"]["Tables"]["recipe_collection_items"]["Row"]
export type RecipeCollectionItemInsert = Database["public"]["Tables"]["recipe_collection_items"]["Insert"]
export type RecipeCollectionItemUpdate = Database["public"]["Tables"]["recipe_collection_items"]["Update"]

export interface RecipeCollectionWithCount extends RecipeCollectionRow {
  recipe_count: number
}

const DEFAULT_COLLECTION_NAME = "Saved Recipes"

type RecipeCollectionRecipeJoin = {
  recipe_id: string
  recipes: any
}

function mapRecipeFromJoin(recipe: any): Recipe {
  const description = recipe.description ?? recipe.content?.description ?? ""
  const imageUrl = recipe.image_url ?? recipe.content?.image_url
  const instructions = parseInstructionsFromDB(recipe.instructions_list ?? recipe.content?.instructions)

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
}

/**
 * Database operations for recipe collections.
 * The legacy recipeFavoritesDB name is preserved as a compatibility alias.
 */
class RecipeCollectionsTable extends BaseTable<
  "recipe_collections",
  RecipeCollectionRow,
  RecipeCollectionInsert,
  RecipeCollectionUpdate
> {
  private static instance: RecipeCollectionsTable | null = null
  readonly tableName = "recipe_collections" as const

  private constructor() {
    super()
  }

  static getInstance(): RecipeCollectionsTable {
    if (!RecipeCollectionsTable.instance) {
      RecipeCollectionsTable.instance = new RecipeCollectionsTable()
    }
    return RecipeCollectionsTable.instance
  }

  async ensureDefaultCollection(userId: string): Promise<RecipeCollectionRow | null> {
    const existing = await this.fetchDefaultCollection(userId)
    if (existing) return existing

    const nextSortOrder = await this.getNextSortOrder(userId)
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        user_id: userId,
        name: DEFAULT_COLLECTION_NAME,
        is_default: true,
        sort_order: nextSortOrder,
      })
      .select()
      .maybeSingle()

    if (error) {
      this.handleError(error, "ensureDefaultCollection")
      return null
    }

    return data ?? null
  }

  async fetchDefaultCollection(userId: string): Promise<RecipeCollectionRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle()

    if (error) {
      this.handleError(error, "fetchDefaultCollection")
      return null
    }

    return data ?? null
  }

  async fetchUserCollections(userId: string): Promise<RecipeCollectionRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      this.handleError(error, "fetchUserCollections")
      return []
    }

    return data || []
  }

  async fetchUserCollectionsWithCounts(userId: string): Promise<RecipeCollectionWithCount[]> {
    const collections = await this.fetchUserCollections(userId)
    if (collections.length === 0) return []

    const collectionIds = collections.map((collection) => collection.id)
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("collection_id")
      .in("collection_id", collectionIds)

    if (error) {
      this.handleError(error, "fetchUserCollectionsWithCounts")
      return collections.map((collection) => ({ ...collection, recipe_count: 0 }))
    }

    const counts = new Map<string, number>()
    for (const row of data || []) {
      counts.set(row.collection_id, (counts.get(row.collection_id) || 0) + 1)
    }

    return collections.map((collection) => ({
      ...collection,
      recipe_count: counts.get(collection.id) || 0,
    }))
  }

  async fetchCollectionsForRecipe(userId: string, recipeId: string): Promise<RecipeCollectionRow[]> {
    const collections = await this.fetchUserCollections(userId)
    if (collections.length === 0) return []

    const collectionIds = collections.map((collection) => collection.id)
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("collection_id, recipe_id")
      .eq("recipe_id", recipeId)
      .in("collection_id", collectionIds)

    if (error) {
      this.handleError(error, "fetchCollectionsForRecipe")
      return []
    }

    const savedCollectionIds = new Set((data || []).map((row) => row.collection_id))
    return collections.filter((collection) => savedCollectionIds.has(collection.id))
  }

  async fetchCollectionRecipeIds(collectionId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("recipe_id")
      .eq("collection_id", collectionId)

    if (error) {
      this.handleError(error, "fetchCollectionRecipeIds")
      return []
    }

    return (data || []).map((item) => item.recipe_id)
  }

  async fetchFavoriteRecipeIds(userId: string): Promise<string[]> {
    console.log("[Recipe Collections DB] Fetching saved recipe IDs for user:", userId)

    const collections = await this.fetchUserCollections(userId)
    if (collections.length === 0) return []

    const collectionIds = collections.map((collection) => collection.id)
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("recipe_id, collection_id")
      .in("collection_id", collectionIds)

    if (error) {
      this.handleError(error, "fetchFavoriteRecipeIds")
      return []
    }

    return Array.from(new Set((data || []).map((item) => item.recipe_id)))
  }

  async fetchFavoriteRecipes(userId: string): Promise<Recipe[]> {
    console.log("[Recipe Collections DB] Fetching saved recipes for user:", userId)

    const collections = await this.fetchUserCollections(userId)
    if (collections.length === 0) return []

    const collectionIds = collections.map((collection) => collection.id)
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
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
      .in("collection_id", collectionIds)

    if (error) {
      if (error.code === "PGRST116" || error.code === "PGRST200" || error.message?.includes("relation")) {
        console.log("[Recipe Collections DB] Collection tables not available or relationship not configured:", error.message)
        return []
      }
      this.handleError(error, "fetchFavoriteRecipes")
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    const recipesById = new Map<string, Recipe>()
    for (const item of data as RecipeCollectionRecipeJoin[]) {
      if (!item.recipes) continue
      if (!recipesById.has(item.recipes.id)) {
        recipesById.set(item.recipes.id, mapRecipeFromJoin(item.recipes))
      }
    }

    return Array.from(recipesById.values())
  }

  async isFavorite(_userId: string, recipeId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("id")
      .eq("recipe_id", recipeId)
      .limit(1)
      .maybeSingle()

    if (error) {
      this.handleError(error, "isFavorite")
      return false
    }

    return !!data
  }

  async isRecipeInCollection(collectionId: string, recipeId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .select("id")
      .eq("collection_id", collectionId)
      .eq("recipe_id", recipeId)
      .maybeSingle()

    if (error) {
      this.handleError(error, "isRecipeInCollection")
      return false
    }

    return !!data
  }

  async addFavorite(userId: string, recipeId: string): Promise<RecipeCollectionItemRow | null> {
    console.log("[Recipe Collections DB] Adding recipe to default collection:", { userId, recipeId })

    const collection = await this.ensureDefaultCollection(userId)
    if (!collection) return null

    return this.addRecipeToCollection(collection.id, recipeId)
  }

  async addRecipeToCollection(
    collectionId: string,
    recipeId: string
  ): Promise<RecipeCollectionItemRow | null> {
    const { data, error } = await this.supabase
      .from("recipe_collection_items")
      .upsert(
        {
          collection_id: collectionId,
          recipe_id: recipeId,
        },
        {
          onConflict: "collection_id,recipe_id",
          ignoreDuplicates: true,
        }
      )
      .select()
      .maybeSingle()

    if (error) {
      this.handleError(error, "addRecipeToCollection")
      return null
    }

    return data ?? null
  }

  async removeFavorite(userId: string, recipeId: string): Promise<boolean> {
    console.log("[Recipe Collections DB] Removing recipe from default collection:", { userId, recipeId })

    const collection = await this.ensureDefaultCollection(userId)
    if (!collection) return false

    const { error } = await this.supabase
      .from("recipe_collection_items")
      .delete()
      .eq("collection_id", collection.id)
      .eq("recipe_id", recipeId)

    if (error) {
      this.handleError(error, "removeFavorite")
      return false
    }

    return true
  }

  async removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("recipe_collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .eq("recipe_id", recipeId)

    if (error) {
      this.handleError(error, "removeRecipeFromCollection")
      return false
    }

    return true
  }

  async toggleFavorite(userId: string, recipeId: string): Promise<boolean> {
    const collection = await this.ensureDefaultCollection(userId)
    if (!collection) return false

    const isCurrentlyFavorite = await this.isRecipeInCollection(collection.id, recipeId)

    if (isCurrentlyFavorite) {
      await this.removeRecipeFromCollection(collection.id, recipeId)
      return false
    }

    await this.addRecipeToCollection(collection.id, recipeId)
    return true
  }

  async createCollection(userId: string, name: string): Promise<RecipeCollectionRow | null> {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const existing = await this.fetchUserCollections(userId)
    const nextSortOrder = existing.reduce((max, collection) => Math.max(max, collection.sort_order || 0), -1) + 1
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        user_id: userId,
        name: trimmedName,
        is_default: false,
        sort_order: nextSortOrder,
      })
      .select()
      .maybeSingle()

    if (error) {
      this.handleError(error, "createCollection")
      return null
    }

    return data ?? null
  }

  async renameCollection(collectionId: string, name: string): Promise<RecipeCollectionRow | null> {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ name: trimmedName })
      .eq("id", collectionId)
      .select()
      .maybeSingle()

    if (error) {
      this.handleError(error, "renameCollection")
      return null
    }

    return data ?? null
  }

  async deleteCollection(collectionId: string): Promise<boolean> {
    const collection = await this.supabase
      .from(this.tableName)
      .select("id, is_default")
      .eq("id", collectionId)
      .maybeSingle()

    if (collection.error) {
      this.handleError(collection.error, "deleteCollection")
      return false
    }

    if (collection.data?.is_default) {
      return false
    }

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("id", collectionId)

    if (error) {
      this.handleError(error, "deleteCollection")
      return false
    }

    return true
  }

  async clearAllFavorites(userId: string): Promise<boolean> {
    console.log("[Recipe Collections DB] Clearing all saved recipes for user:", userId)

    const collections = await this.fetchUserCollections(userId)
    if (collections.length === 0) return true

    const collectionIds = collections.map((collection) => collection.id)
    const { error } = await this.supabase
      .from("recipe_collection_items")
      .delete()
      .in("collection_id", collectionIds)

    if (error) {
      this.handleError(error, "clearAllFavorites")
      return false
    }

    return true
  }

  private async getNextSortOrder(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return 0
    }

    return (data.sort_order || 0) + 1
  }
}

export const recipeCollectionsDB = RecipeCollectionsTable.getInstance()
export const recipeFavoritesDB = recipeCollectionsDB
