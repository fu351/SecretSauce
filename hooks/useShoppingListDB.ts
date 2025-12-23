"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Universal database operations for shopping list items
 * Separated from state management for reusability across different components
 */

export function useShoppingListDB() {
  /**
   * Map raw database item to typed ShoppingListItem
   */
  const mapShoppingItem = useCallback((dbItem: any): ShoppingListItem => {
    const resolvedName = dbItem.standardized_ingredients?.canonical_name || dbItem.name || "Unknown Item"

    return {
      id: dbItem.id,
      user_id: dbItem.user_id,
      name: resolvedName,
      quantity: Number(dbItem.quantity),
      unit: dbItem.unit || "piece",
      checked: dbItem.checked || false,
      source_type: dbItem.source_type,
      recipe_id: dbItem.recipe_id,
      recipe_ingredient_index: dbItem.recipe_ingredient_index,
      servings: dbItem.servings ? Number(dbItem.servings) : undefined,
      ingredient_id: dbItem.ingredient_id,
      standardizedName: dbItem.standardized_ingredients?.canonical_name,
      price: dbItem.price ? Number(dbItem.price) : undefined,
      store_name: dbItem.store_name,
      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at
    }
  }, [])

  /**
   * Fetch all items for a user
   */
  const fetchUserItems = useCallback(async (userId: string): Promise<ShoppingListItem[]> => {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .select(`
        *,
        standardized_ingredients (canonical_name),
        recipes (id, title)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return (data || []).map(mapShoppingItem)
  }, [mapShoppingItem])

  /**
   * Insert a new item
   */
  const insertItem = useCallback(async (item: Partial<ShoppingListItem>) => {
    console.log("[Shopping List DB] Attempting to insert item:", item)
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert(item)
      .select(`*, standardized_ingredients (canonical_name)`)
      .single()

    if (error) {
      console.error("[Shopping List DB] Insert error:", error)
      throw error
    }
    console.log("[Shopping List DB] Insert successful, returned data:", data)
    return mapShoppingItem(data)
  }, [mapShoppingItem])

  /**
   * Update an existing item
   */
  const updateItem = useCallback(async (id: string, updates: Partial<ShoppingListItem>) => {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .update(updates)
      .eq("id", id)
      .select(`*, standardized_ingredients (canonical_name)`)
      .single()

    if (error) throw error
    return mapShoppingItem(data)
  }, [mapShoppingItem])

  /**
   * Bulk upsert items (for recipes with multiple ingredients)
   * Note: Since recipe items are typically added after removing old ones,
   * we use insert which is simpler and avoids constraint issues.
   */
  const upsertItems = useCallback(async (items: Partial<ShoppingListItem>[]) => {
    if (!items || items.length === 0) {
      console.warn("[Shopping List DB] upsertItems called with empty items array")
      return []
    }

    console.log("[Shopping List DB] Inserting items:", items)
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert(items)
      .select(`*, standardized_ingredients (canonical_name)`)

    if (error) {
      console.error("[Shopping List DB] Insert error:", error)
      throw error
    }
    console.log("[Shopping List DB] Insert successful, returned data:", data)
    return (data || []).map(mapShoppingItem)
  }, [mapShoppingItem])

  /**
   * Delete a single item
   */
  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("shopping_list_items")
      .delete()
      .eq("id", id)

    if (error) throw error
  }, [])

  /**
   * Delete all items for a recipe
   */
  const deleteRecipeItems = useCallback(async (userId: string, recipeId: string) => {
    const { error } = await supabase
      .from("shopping_list_items")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("user_id", userId)

    if (error) throw error
  }, [])

  /**
   * Batch update multiple items
   */
  const batchUpdateItems = useCallback(async (updates: Array<{ id: string; changes: Partial<ShoppingListItem> }>) => {
    const results = await Promise.all(
      updates.map(({ id, changes }) => updateItem(id, changes))
    )
    return results
  }, [updateItem])

  return useMemo(() => ({
    mapShoppingItem,
    fetchUserItems,
    insertItem,
    updateItem,
    upsertItems,
    deleteItem,
    deleteRecipeItems,
    batchUpdateItems
  }), [mapShoppingItem, fetchUserItems, insertItem, updateItem, upsertItems, deleteItem, deleteRecipeItems, batchUpdateItems])
}
