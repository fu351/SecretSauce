"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "../ui/use-toast"
import { shoppingListDB } from "@/lib/database/store-list-db"
import { recipeIngredientsDB } from "@/lib/database/recipe-ingredients-db"
import { useShoppingListItems } from "./use-shopping-list-items"
import { useShoppingListRecipes } from "./use-shopping-list-recipes"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Main shopping list hook
 * Composes DB operations and specialized sub-hooks for complete shopping list management
 * Maintains the same API as before for backwards compatibility
 *
 * @returns {UseShoppingListReturn} Complete shopping list state and operations
 *
 * @example
 * ```tsx
 * function ShoppingPage() {
 *   const { items, loading, addItem, removeItem } = useShoppingList()
 *   return <ShoppingList items={items} onAdd={addItem} onRemove={removeItem} />
 * }
 * ```
 */
export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load shopping list from database
  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      setHasChanges(false)
      return
    }

    setLoading(true)
    try {
      const loadedItems = await shoppingListDB.fetchUserItems(user.id)
      setItems(loadedItems)
      setHasChanges(false)
    } catch (error) {
      console.error("Error loading list:", error)
      toast({ title: "Error", description: "Could not load list.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [user, toast])

  // Compose sub-hooks for item and recipe operations
  const itemOperations = useShoppingListItems(items, setItems, setHasChanges, user?.id ?? null, loadShoppingList)
  const recipeOperations = useShoppingListRecipes(
    items,
    setItems,
    loadShoppingList,
    user?.id ?? null,
    recipeIngredientsDB
  )

  // Batch save sync
  const saveChanges = useCallback(async () => {
    if (!user || !hasChanges) return
    setHasChanges(false)
    toast({ title: "Success", description: "List synchronized." })
  }, [user, hasChanges, toast])

  // Initial load
  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  return {
    items,
    loading,
    hasChanges,
    ...itemOperations,
    ...recipeOperations,
    saveChanges,
    loadShoppingList
  }
}
