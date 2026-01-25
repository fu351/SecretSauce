"use client"

import { useCallback } from "react"
import { useToast } from "../ui/use-toast"
import { shoppingListDB } from "@/lib/database/store-list-db"
import { recipeDB } from "@/lib/database/recipe-db"
import type { ShoppingListItem } from "@/lib/types/store"

type RecipeIngredientRow = {
  id: string
  recipe_id: string
  display_name: string
  quantity: number | null
  units: string | null
  standardized_ingredient_id: string | null
}

type RecipeIngredientsSource = {
  findByRecipeId: (recipeId: string) => Promise<RecipeIngredientRow[]>
  findByRecipeIds: (recipeIds: string[]) => Promise<RecipeIngredientRow[]>
}

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
  userId: string | null,
  recipeIngredientsDB: RecipeIngredientsSource
) {
  const { toast } = useToast()

  /**
   * Add a recipe and all its ingredients to the shopping list
   */
  const addRecipeToCart = useCallback(
    async (recipeId: string, servings?: number) => {
      if (!userId) return

      try {
        const [recipe, ingredients] = await Promise.all([
          recipeDB.fetchRecipeById(recipeId),
          recipeIngredientsDB.findByRecipeId(recipeId)
        ])

        if (!recipe) {
          throw new Error("Recipe not found")
        }

        if (!ingredients || ingredients.length === 0) {
          throw new Error("Recipe has no ingredients")
        }

        const finalServings = servings || recipe.servings || 1
        const baseServings = recipe.servings || 1

        // Create shopping list items from recipe ingredients
        const itemsToInsert = ingredients.map((ing, idx) => {
          const baseAmount = Number(ing.quantity) || 1
          const perServingAmount = baseAmount / baseServings
          const finalQuantity = perServingAmount * finalServings

          return {
            user_id: userId,
            source_type: 'recipe' as const,
            recipe_id: recipeId,
            recipe_ingredient_id: ing.id,
            name: ing.display_name,
            quantity: finalQuantity,
            unit: ing.units || "piece",
            ingredient_id: ing.standardized_ingredient_id,
            checked: false,
            servings: finalServings,
            category: "other"  // Default to "other" to match database enum
          }
        })

        await shoppingListDB.upsertItems(itemsToInsert)

        // Database handles merging - reload to get the final state
        await loadShoppingList()

        toast({ title: "Recipe Added", description: `Added ${recipe.title} to list.` })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to add recipe"
        toast({ title: "Error", description: errorMessage, variant: "destructive" })
      }
    },
    [userId, toast, loadShoppingList, recipeIngredientsDB]
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

  /**
   * Add multiple recipes to cart in a single bulk operation
   */
  const addRecipesToCart = useCallback(
    async (recipeIds: string[]) => {
      if (!userId || recipeIds.length === 0) return

      try {
        // Fetch all recipes in parallel
        const [recipes, ingredients] = await Promise.all([
          recipeDB.fetchRecipeByIds(recipeIds),
          recipeIngredientsDB.findByRecipeIds(recipeIds)
        ])

        const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]))
        const ingredientsByRecipeId = new Map<string, RecipeIngredientRow[]>()
        for (const ingredient of ingredients) {
          const list = ingredientsByRecipeId.get(ingredient.recipe_id) || []
          list.push(ingredient)
          ingredientsByRecipeId.set(ingredient.recipe_id, list)
        }

        // Build all items to insert
        const allItemsToInsert: any[] = []
        let totalRecipesAdded = 0

        for (const recipeId of recipeIds) {
          const recipe = recipesById.get(recipeId)
          const recipeIngredients = ingredientsByRecipeId.get(recipeId) || []

          if (!recipe || recipeIngredients.length === 0) {
            continue
          }

          const finalServings = recipe.servings || 1
          const baseServings = recipe.servings || 1

          const recipeItems = recipeIngredients.map((ing, idx) => {
            const baseAmount = Number(ing.quantity) || 1
            const perServingAmount = baseAmount / baseServings
            const finalQuantity = perServingAmount * finalServings

            return {
              user_id: userId,
              source_type: 'recipe' as const,
              recipe_id: recipeId,
              recipe_ingredient_id: ing.id,
              name: ing.display_name,
              quantity: finalQuantity,
              unit: ing.units || "piece",
              ingredient_id: ing.standardized_ingredient_id,
              checked: false,
              servings: finalServings,
              category: "other"  // Default to "other" to match database enum
            }
          })

          allItemsToInsert.push(...recipeItems)
          totalRecipesAdded++
        }

        if (allItemsToInsert.length === 0) {
          throw new Error("No valid recipes to add")
        }

        // Single bulk insert
        await shoppingListDB.upsertItems(allItemsToInsert)

        // Database handles merging - reload to get the final state
        await loadShoppingList()

        return totalRecipesAdded
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to add recipes"
        throw new Error(errorMessage)
      }
    },
    [userId, loadShoppingList, recipeIngredientsDB]
  )

  return {
    addRecipeToCart,
    addRecipesToCart,
    updateRecipeServings,
    removeRecipe,
    clearCheckedItems
  }
}
