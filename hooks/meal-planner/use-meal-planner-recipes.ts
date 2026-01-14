"use client"

import { useState, useCallback, useEffect } from "react"
import { useMealPlannerDB } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

export function useMealPlannerRecipes(userId: string | undefined) {
  const db = useMealPlannerDB()
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)

  const loadFavoriteRecipes = useCallback(async () => {
    if (!userId) return

    try {
      setLoading(true)
      const recipes = await db.fetchFavoriteRecipes(userId)
      setFavoriteRecipes(recipes)
    } catch (error) {
      console.error("[Meal Planner Recipes Hook] Error loading favorite recipes:", error)
      setFavoriteRecipes([])
    } finally {
      setLoading(false)
    }
  }, [userId, db])

  const loadSuggestedRecipes = useCallback(async () => {
    try {
      setLoading(true)
      const recipes = await db.fetchSuggestedRecipes(20)
      setSuggestedRecipes(recipes)
    } catch (error) {
      console.error("[Meal Planner Recipes Hook] Error loading suggested recipes:", error)
      setSuggestedRecipes([])
    } finally {
      setLoading(false)
    }
  }, [db])

  const loadAllRecipes = useCallback(async () => {
    await Promise.all([loadFavoriteRecipes(), loadSuggestedRecipes()])
  }, [loadFavoriteRecipes, loadSuggestedRecipes])

  return {
    favoriteRecipes,
    suggestedRecipes,
    loading,
    loadFavoriteRecipes,
    loadSuggestedRecipes,
    loadAllRecipes,
  }
}
