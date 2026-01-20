"use client"

import { useCallback } from "react"
import { useToast } from "../ui/use-toast"
import { shoppingListDB } from "@/lib/database/store-list-db"
import { recipeDB } from "@/lib/database/recipe-db"
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

  /**
   * Add a recipe and all its ingredients to the shopping list
   */
  const addRecipeToCart = useCallback(
    async (recipeId: string, servings?: number) => {
      if (!userId) return

      try {
        // Fetch recipe details
        const recipe = await recipeDB.fetchRecipeById(recipeId)

        if (!recipe) {
          throw new Error("Recipe not found")
        }

        if (!recipe.ingredients || recipe.ingredients.length === 0) {
          throw new Error("Recipe has no ingredients")
        }

        const finalServings = servings || recipe.servings || 1
        const baseServings = recipe.servings || 1

        // Create shopping list items from recipe ingredients
        const itemsToInsert = recipe.ingredients.map((ing, idx) => {
          const baseAmount = Number(ing.quantity) || 1
          const perServingAmount = baseAmount / baseServings
          const finalQuantity = perServingAmount * finalServings

          return {
            user_id: userId,
            source_type: 'recipe' as const,
            recipe_id: recipeId,
            recipe_ingredient_index: idx,
            name: ing.name,
            quantity: finalQuantity,
            unit: ing.unit || "piece",
            ingredient_id: ing.standardizedIngredientId,
            checked: false,
            servings: finalServings
          }
        })

        const mappedItems = await shoppingListDB.upsertItems(itemsToInsert)

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
    [userId, toast]
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
          // Calculate new quantity based on servings multiplier
          const currentServings = item.servings || 1
          const perServingAmount = item.quantity / currentServings
          const newQuantity = perServingAmount * safeServings

          const changes = { servings: safeServings, quantity: newQuantity }
          updates.push({ id: item.id, changes })
          return { ...item, ...changes }
        }
        return item
      }))

      if (updates.length > 0) {
        try {
          await shoppingListDB.batchUpdateItems(updates)
        } catch (error) {
          toast({ title: "Error", description: "Sync failed. Reverting...", variant: "destructive" })
          loadShoppingList()
        }
      }
    },
    [toast, loadShoppingList]
  )

  /**
   * Remove all items for a recipe
   */
  const removeRecipe = useCallback(
    async (recipeId: string) => {
      const backup = [...items]
      setItems(prev => prev.filter(item => item.recipe_id !== recipeId))

      try {
        if (userId) await shoppingListDB.deleteRecipeItems(userId, recipeId)
      } catch (error) {
        setItems(backup)
        toast({ title: "Error", description: "Failed to remove recipe.", variant: "destructive" })
      }
    },
    [userId, items, toast]
  )

  /**
   * Clear all checked items from the shopping list
   */
  const clearCheckedItems = useCallback(async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    if (checkedIds.length === 0) return

    setItems(prev => prev.filter(i => !i.checked))

    try {
      await shoppingListDB.deleteBatch(checkedIds)
      toast({ title: "List cleared", description: "Checked items removed." })
    } catch (error) {
      loadShoppingList()
      toast({ title: "Error", description: "Failed to clear items.", variant: "destructive" })
    }
  }, [items, toast, loadShoppingList])

  return {
    addRecipeToCart,
    updateRecipeServings,
    removeRecipe,
    clearCheckedItems
  }
}
