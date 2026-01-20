"use client"

import { BaseTable } from "./base-db"
import type { Database } from "@/lib/supabase"
import type { ShoppingListItem } from "@/lib/types/store"

type ShoppingListItemRow = Database["public"]["Tables"]["shopping_list_items"]["Row"]
type ShoppingListItemInsert = Database["public"]["Tables"]["shopping_list_items"]["Insert"]
type ShoppingListItemUpdate = Database["public"]["Tables"]["shopping_list_items"]["Update"]

/**
 * Database operations for shopping list items
 * Singleton class extending BaseTable with specialized shopping list operations
 *
 * NOTE: Unlike other DB classes, this one THROWS errors instead of returning null
 */
class ShoppingListTable extends BaseTable<
  "shopping_list_items",
  ShoppingListItemRow,
  ShoppingListItemInsert,
  ShoppingListItemUpdate
> {
  private static instance: ShoppingListTable | null = null
  readonly tableName = "shopping_list_items" as const

  private constructor() {
    super()
  }

  static getInstance(): ShoppingListTable {
    if (!ShoppingListTable.instance) {
      ShoppingListTable.instance = new ShoppingListTable()
    }
    return ShoppingListTable.instance
  }

  /**
   * Map raw database item to typed ShoppingListItem
   * Ensures proper type coercion for quantity and servings
   */
  protected map(dbItem: any): ShoppingListItem {
    return {
      id: dbItem.id,
      user_id: dbItem.user_id,
      name: dbItem.name,
      quantity: Number(dbItem.quantity),
      unit: dbItem.unit || "piece",
      checked: dbItem.checked || false,
      source_type: dbItem.source_type,
      recipe_id: dbItem.recipe_id,
      recipe_ingredient_index: dbItem.recipe_ingredient_index,
      servings: dbItem.servings ? Number(dbItem.servings) : undefined,
      ingredient_id: dbItem.ingredient_id,
      category: dbItem.category || null,
      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at,
    }
  }

  /**
   * Fetch all items for a user
   */
  async fetchUserItems(userId: string): Promise<ShoppingListItem[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return (data || []).map((item) => this.map(item))
  }

  /**
   * Insert a new item
   * Note: Database triggers may merge items, so we don't return the inserted item
   * Callers should reload the shopping list to get the final state
   */
  async insertItem(item: Partial<ShoppingListItem>): Promise<void> {
    console.log("[Shopping List DB] Attempting to insert item:", item)
    const { error } = await this.supabase
      .from(this.tableName)
      .insert(item as any)

    if (error) {
      console.error("[Shopping List DB] Insert error:", error)
      throw error
    }
    console.log("[Shopping List DB] Insert successful (triggers may have merged)")
  }

  /**
   * Update an existing item
   */
  async updateItem(id: string, updates: Partial<ShoppingListItem>): Promise<ShoppingListItem> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return this.map(data)
  }

  /**
   * Bulk upsert items (for recipes with multiple ingredients)
   * Note: Since recipe items are typically added after removing old ones,
   * we use insert which is simpler and avoids constraint issues.
   */
  async upsertItems(items: Partial<ShoppingListItem>[]): Promise<ShoppingListItem[]> {
    if (!items || items.length === 0) {
      console.warn("[Shopping List DB] upsertItems called with empty items array")
      return []
    }

    console.log("[Shopping List DB] Inserting items:", items)
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(items as any)
      .select("*")

    if (error) {
      console.error("[Shopping List DB] Insert error:", error)
      throw error
    }
    console.log("[Shopping List DB] Insert successful, returned data:", data)
    return (data || []).map((item) => this.map(item))
  }

  /**
   * Delete a single item
   */
  async deleteItem(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).delete().eq("id", id)

    if (error) throw error
  }

  /**
   * Delete all items for a recipe
   */
  async deleteRecipeItems(userId: string, recipeId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("recipe_id", recipeId)
      .eq("user_id", userId)

    if (error) throw error
  }

  /**
   * Delete multiple items by their IDs (batch operation)
   */
  async deleteBatch(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) {
      return
    }

    const { error } = await this.supabase.from(this.tableName).delete().in("id", ids)

    if (error) throw error
  }

  /**
   * Batch update multiple items using a single bulk operation
   * Groups updates by common fields to minimize API calls
   */
  async batchUpdateItems(
    updates: Array<{ id: string; changes: Partial<ShoppingListItem> }>
  ): Promise<ShoppingListItem[]> {
    if (!updates || updates.length === 0) {
      return []
    }

    // If all updates have identical changes, do a single bulk update
    const firstChanges = updates[0].changes
    const allIdentical = updates.every((u) => JSON.stringify(u.changes) === JSON.stringify(firstChanges))

    if (allIdentical && updates.length > 1) {
      const ids = updates.map((u) => u.id)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          ...firstChanges,
          updated_at: new Date().toISOString(),
        } as any)
        .in("id", ids)
        .select("*")

      if (error) throw error
      return (data || []).map((item) => this.map(item))
    }

    // Otherwise, execute updates in parallel
    const results = await Promise.all(updates.map(({ id, changes }) => this.updateItem(id, changes)))
    return results
  }
}

// Export singleton instance
export const shoppingListDB = ShoppingListTable.getInstance()
