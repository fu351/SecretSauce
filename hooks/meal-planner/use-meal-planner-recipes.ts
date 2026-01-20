"use client"

import { useState, useCallback, useRef } from "react"
import { mealPlannerDB } from "@/lib/database/meal-planner-db"
import { recipeFavoritesDB } from "@/lib/database/recipe-favorites-db"
import type { Recipe } from "@/lib/types"

export function useMealPlannerRecipes(userId: string | undefined) {
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef({ favorites: false, suggested: false })

  const loadFavoriteRecipes = useCallback(async () => {
    if (!userId) return
    if (loadingRef.current.favorites) return

    try {
      loadingRef.current.favorites = true
      setLoading(true)
      const recipes = await recipeFavoritesDB.fetchFavoriteRecipes(userId)
      setFavoriteRecipes(recipes)
    } catch (error) {
      console.error("[Meal Planner Recipes Hook] Error loading favorite recipes:", error)
      setFavoriteRecipes([])
    } finally {
      loadingRef.current.favorites = false
      setLoading(false)
    }
  }, [userId])

  const loadSuggestedRecipes = useCallback(async () => {
    if (loadingRef.current.suggested) return

    try {
      loadingRef.current.suggested = true
      setLoading(true)
      const recipes = await mealPlannerDB.fetchSuggestedRecipes(20)
      setSuggestedRecipes(recipes)
    } catch (error) {
      console.error("[Meal Planner Recipes Hook] Error loading suggested recipes:", error)
      setSuggestedRecipes([])
    } finally {
      loadingRef.current.suggested = false
      setLoading(false)
    }
  }, [])

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
