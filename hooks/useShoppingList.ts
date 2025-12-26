"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { useShoppingListDB } from "./useShoppingListDB"
import { useRecipeCart } from "./useRecipeCart"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Main shopping list hook
 * Composes DB operations and recipe cart utilities for a complete shopping list experience
 */
export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()
  const db = useShoppingListDB()
  const recipeCart = useRecipeCart()

  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // --- Load List ---
  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const loadedItems = await db.fetchUserItems(user.id)
      setItems(loadedItems)
      setHasChanges(false)
    } catch (error) {
      console.error("Error loading list:", error)
      toast({ title: "Error", description: "Could not load list.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [user, toast, db])

  // --- Single Item Actions ---

  /**
   * Add a new manual item to the shopping list
   */
  const addItem = useCallback(
    async (name: string, quantity = 1, unit = "piece", checked = false, ingredientId?: string) => {
      if (!user) return null

      const tempId = `temp-${crypto.randomUUID()}`
      const newItem: ShoppingListItem = {
        id: tempId,
        user_id: user.id,
        name,
        quantity,
        unit,
        checked,
        source_type: 'manual',
        ingredient_id: ingredientId
      }
      
      setItems(prev => [...prev, newItem])

      try {
        const realItem = await db.insertItem({
          user_id: user.id,
          name,
          quantity,
          unit,
          checked,
          source_type: 'manual',
          ingredient_id: ingredientId
        })
        setItems(prev => prev.map(item => item.id === tempId ? realItem : item))
        return realItem
      } catch (error) {
        setItems(prev => prev.filter(item => item.id !== tempId))
        toast({ title: "Error", description: "Failed to save item.", variant: "destructive" })
        return null
      }
    },
    [user, toast, db]
  )

  /**
   * Remove an item from the shopping list
   */
  const removeItem = useCallback(
    async (id: string) => {
      const backup = items.find(i => i.id === id)
      if (!backup) return

      setItems(prev => prev.filter(item => item.id !== id))

      try {
        await db.deleteItem(id)
      } catch (error) {
        setItems(prev => [...prev, backup])
        toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" })
      }
    },
    [items, toast, db]
  )

  /**
   * Update quantity for a single item
   */
  const updateQuantity = useCallback(
    (id: string, newTotalQuantity: number) => {
      const safeQuantity = Math.max(1, newTotalQuantity)

      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, quantity: safeQuantity } : item
      ))

      db.updateItem(id, { quantity: safeQuantity })
        .catch(() => {
          toast({ title: "Error", description: "Failed to update quantity.", variant: "destructive" })
        })

      setHasChanges(true)
    },
    [toast, db]
  )

  /**
   * Update item name (manual items only)
   */
  const updateItemName = useCallback(
    async (id: string, newName: string) => {
      const currentItem = items.find(i => i.id === id)
      if (!currentItem || currentItem.name === newName) return

      if (currentItem.source_type === 'recipe') {
        toast({ title: "Cannot Update", description: "Recipe ingredient names are fixed.", variant: "destructive" })
        return
      }

      setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item))

      try {
        await db.updateItem(id, { name: newName })
      } catch (error) {
        setItems(prev => prev.map(item => item.id === id ? { ...item, name: currentItem.name } : item))
        toast({ title: "Error", description: "Failed to update item name.", variant: "destructive" })
      }
    },
    [items, toast, db]
  )

  /**
   * Toggle checked state for an item
   */
  const toggleChecked = useCallback(
    (id: string) => {
      const item = items.find(i => i.id === id)
      if (!item) return

      const newValue = !item.checked
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: newValue } : i))

      db.updateItem(id, { checked: newValue })
        .catch(() => {
          toast({ title: "Error", description: "Failed to update item.", variant: "destructive" })
        })

      setHasChanges(true)
    },
    [items, toast, db]
  )

  // --- Recipe Actions ---

  /**
   * Add a recipe and all its ingredients to the shopping list
   */
  const addRecipeToCart = useCallback(
    async (recipeId: string, servings?: number) => {
      if (!user) return

      try {
        const recipe = await recipeCart.fetchRecipeDetails(recipeId)
        const validation = recipeCart.validateRecipe(recipe)
        
        if (!validation.valid) throw new Error(validation.error || "Invalid recipe")

        const finalServings = servings || recipe.servings || 1
        const itemsToInsert = recipeCart.createRecipeItems(user.id, recipeId, recipe, finalServings)
        const mappedItems = await db.upsertItems(itemsToInsert)

        setItems(prev => {
          const filtered = prev.filter(item => item.recipe_id !== recipeId)
          return [...filtered, ...mappedItems]
        })

        toast({ title: "Recipe Added", description: `Added ${recipe.title} to list.` })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to add recipe"
        toast({ title: "Error", description: errorMessage, variant: "destructive" })
      }
    },
    [user, toast, db, recipeCart]
  )

  /**
   * Update servings for all items in a recipe with scale logic
   */
  const updateRecipeServings = useCallback(
    async (recipeId: string, newServings: number) => {
      const safeServings = Math.max(1, newServings)
      const updates: { id: string; changes: any }[] = []

      // Optimistic update
      setItems(prev => prev.map(item => {
        if (item.recipe_id === recipeId && item.source_type === 'recipe') {
          const newQuantity = recipeCart.calculateServingMultiplier(
            item.quantity,
            item.servings || 1,
            safeServings
          )
          const changes = { servings: safeServings, quantity: newQuantity }
          updates.push({ id: item.id, changes })
          return { ...item, ...changes }
        }
        return item
      }))

      if (updates.length > 0) {
        try {
          await db.batchUpdateItems(updates)
          setHasChanges(true)
        } catch (error) {
          toast({ title: "Error", description: "Sync failed. Reverting...", variant: "destructive" })
          loadShoppingList()
        }
      }
    },
    [db, recipeCart, toast, loadShoppingList]
  )

  /**
   * Remove all items for a recipe
   */
  const removeRecipe = useCallback(
    async (recipeId: string) => {
      const backup = [...items]
      setItems(prev => prev.filter(item => item.recipe_id !== recipeId))

      try {
        if (user) await db.deleteRecipeItems(user.id, recipeId)
      } catch (error) {
        setItems(backup)
        toast({ title: "Error", description: "Failed to remove recipe.", variant: "destructive" })
      }
    },
    [user, items, db, toast]
  )

  /**
   * Clear all checked items
   */
  const clearCheckedItems = useCallback(async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    if (checkedIds.length === 0) return

    setItems(prev => prev.filter(i => !i.checked))

    try {
      await db.deleteBatch(checkedIds)
      toast({ title: "List cleared", description: "Checked items removed." })
    } catch (error) {
      loadShoppingList()
      toast({ title: "Error", description: "Failed to clear items.", variant: "destructive" })
    }
  }, [items, db, toast, loadShoppingList])

  // --- Batch Save Sync ---
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
    addItem,
    removeItem,
    updateQuantity,
    updateItemName,
    toggleChecked,
    addRecipeToCart,
    updateRecipeServings,
    removeRecipe,
    clearCheckedItems,
    saveChanges,
    loadShoppingList
  }
}