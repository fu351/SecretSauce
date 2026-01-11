"use client"

import { useCallback } from "react"
import { useToast } from "../ui/use-toast"
import { useShoppingListDB } from "@/lib/database/store-list-db"
import { useRecipeCart } from "../recipe/use-recipe-cart"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Composable hook for recipe-related shopping list operations
 * Handles adding recipes to cart, updating servings, removing recipes, and clearing checked items
 *
 * @param items - Current shopping list items
 * @param setItems - State setter for items
 * @param loadShoppingList - Function to reload shopping list from database
 * @param userId - Current user ID for database operations
 *
 * @returns Object containing recipe operation functions
 */
export function useShoppingListRecipes(
  items: ShoppingListItem[],
  setItems: React.Dispatch<React.SetStateAction<ShoppingListItem[]>>,
  loadShoppingList: () => Promise<void>,
  userId: string | null
) {
  const { toast } = useToast()
  const db = useShoppingListDB()
  const recipeCart = useRecipeCart()

  /**
   * Add a recipe and all its ingredients to the shopping list
   */
  const addRecipeToCart = useCallback(
    async (recipeId: string, servings?: number) => {
      if (!userId) return

      try {
        const recipe = await recipeCart.fetchRecipeDetails(recipeId)
        const validation = recipeCart.validateRecipe(recipe)

        if (!validation.valid) throw new Error(validation.error || "Invalid recipe")

        const finalServings = servings || recipe.servings || 1
        const itemsToInsert = recipeCart.createRecipeItems(userId, recipeId, recipe, finalServings)
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
    [userId, toast, db, recipeCart]
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
        if (userId) await db.deleteRecipeItems(userId, recipeId)
      } catch (error) {
        setItems(backup)
        toast({ title: "Error", description: "Failed to remove recipe.", variant: "destructive" })
      }
    },
    [userId, items, db, toast]
  )

  /**
   * Clear all checked items from the shopping list
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

  return {
    addRecipeToCart,
    updateRecipeServings,
    removeRecipe,
    clearCheckedItems
  }
}
