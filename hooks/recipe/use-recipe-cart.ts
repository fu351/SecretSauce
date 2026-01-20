"use client"

import { useCallback } from "react"
import { recipeDB } from "@/lib/database/recipe-db"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Specialized hook for recipe-to-cart operations
 * Handles bulk ingredient additions, serving calculations, and recipe management
 */

export function useRecipeCart() {
  /**
   * Fetch a recipe's details (servings and ingredients)
   */
  const fetchRecipeDetails = useCallback(async (recipeId: string) => {
    const recipe = await recipeDB.fetchRecipeById(recipeId)

    if (!recipe) {
      throw new Error("Recipe not found")
    }

    return {
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients
    }
  }, [])

  /**
   * Create shopping list items from recipe ingredients
   * Handles per-serving quantity calculations
   */
  const createRecipeItems = useCallback(
    (userId: string, recipeId: string, recipe: any, servings: number): Partial<ShoppingListItem>[] => {
      const baseServings = recipe.servings || 1
      const finalServings = servings || baseServings

      return (recipe.ingredients as any[]).map((ing, idx) => {
        const baseAmount = Number(ing.amount) || 1
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
          ingredient_id: ing.ingredient_id,
          checked: false,
          servings: finalServings
        }
      })
    },
    []
  )

  /**
   * Calculate new quantities when servings change
   * Returns the multiplier for quantity recalculation
   */
  const calculateServingMultiplier = useCallback(
    (currentQuantity: number, currentServings: number, newServings: number): number => {
      if (!currentServings || currentServings === 0) return 1
      const perServingAmount = currentQuantity / currentServings
      return perServingAmount * newServings
    },
    []
  )

  /**
   * Validate recipe exists and has ingredients
   */
  const validateRecipe = useCallback((recipe: any): { valid: boolean; error?: string } => {
    if (!recipe) {
      return { valid: false, error: "Recipe not found" }
    }
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      return { valid: false, error: "Recipe has no ingredients" }
    }
    return { valid: true }
  }, [])

  return {
    fetchRecipeDetails,
    createRecipeItems,
    calculateServingMultiplier,
    validateRecipe
  }
}
