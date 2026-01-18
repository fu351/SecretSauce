"use client"

import { Recipe } from "@/lib/types"
import type { MealScheduleRow } from "./meal-planner-db"

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

class MealPlannerCache {
  private mealScheduleCache = new Map<string, CacheEntry<MealScheduleRow[]>>()
  private recipesCache = new Map<string, CacheEntry<Recipe[]>>()
  private favoriteRecipesCache = new Map<string, CacheEntry<Recipe[]>>()
  private suggestedRecipesCache: CacheEntry<Recipe[]> | null = null

  /**
   * Generate cache key for meal schedule
   */
  private getMealScheduleKey(userId: string, startDate: string, endDate: string): string {
    return `meal_schedule:${userId}:${startDate}:${endDate}`
  }

  /**
   * Generate cache key for recipes
   */
  private getRecipesKey(recipeIds: string[]): string {
    return `recipes:${recipeIds.sort().join(",")}`
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() < entry.expiresAt
  }

  /**
   * Get or set meal schedule cache
   */
  getMealScheduleCache(
    userId: string,
    startDate: string,
    endDate: string
  ): MealScheduleRow[] | null {
    const key = this.getMealScheduleKey(userId, startDate, endDate)
    const cached = this.mealScheduleCache.get(key)

    if (cached && this.isValid(cached)) {
      console.log("[Meal Planner Cache] Cache hit for meal schedule")
      return cached.data
    }

    return null
  }

  /**
   * Set meal schedule cache
   */
  setMealScheduleCache(
    userId: string,
    startDate: string,
    endDate: string,
    data: MealScheduleRow[]
  ): void {
    const key = this.getMealScheduleKey(userId, startDate, endDate)
    const now = Date.now()

    this.mealScheduleCache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
    })

    console.log("[Meal Planner Cache] Cached meal schedule")
  }

  /**
   * Invalidate meal schedule cache for a specific user
   */
  invalidateMealScheduleCache(userId: string): void {
    const keysToDelete: string[] = []

    this.mealScheduleCache.forEach((_, key) => {
      if (key.startsWith(`meal_schedule:${userId}:`)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach((key) => this.mealScheduleCache.delete(key))
    console.log("[Meal Planner Cache] Invalidated meal schedule cache for user:", userId)
  }

  /**
   * Get or set recipes cache
   */
  getRecipesCache(recipeIds: string[]): Recipe[] | null {
    if (recipeIds.length === 0) return []

    const key = this.getRecipesKey(recipeIds)
    const cached = this.recipesCache.get(key)

    if (cached && this.isValid(cached)) {
      console.log("[Meal Planner Cache] Cache hit for recipes")
      return cached.data
    }

    return null
  }

  /**
   * Set recipes cache
   */
  setRecipesCache(recipeIds: string[], data: Recipe[]): void {
    if (recipeIds.length === 0) return

    const key = this.getRecipesKey(recipeIds)
    const now = Date.now()

    this.recipesCache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
    })

    console.log("[Meal Planner Cache] Cached recipes")
  }

  /**
   * Get or set favorite recipes cache
   */
  getFavoriteRecipesCache(userId: string): Recipe[] | null {
    const cached = this.favoriteRecipesCache.get(userId)

    if (cached && this.isValid(cached)) {
      console.log("[Meal Planner Cache] Cache hit for favorite recipes")
      return cached.data
    }

    return null
  }

  /**
   * Set favorite recipes cache
   */
  setFavoriteRecipesCache(userId: string, data: Recipe[]): void {
    const now = Date.now()

    this.favoriteRecipesCache.set(userId, {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
    })

    console.log("[Meal Planner Cache] Cached favorite recipes")
  }

  /**
   * Get or set suggested recipes cache
   */
  getSuggestedRecipesCache(): Recipe[] | null {
    if (this.suggestedRecipesCache && this.isValid(this.suggestedRecipesCache)) {
      console.log("[Meal Planner Cache] Cache hit for suggested recipes")
      return this.suggestedRecipesCache.data
    }

    return null
  }

  /**
   * Set suggested recipes cache
   */
  setSuggestedRecipesCache(data: Recipe[]): void {
    const now = Date.now()

    this.suggestedRecipesCache = {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
    }

    console.log("[Meal Planner Cache] Cached suggested recipes")
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.mealScheduleCache.clear()
    this.recipesCache.clear()
    this.favoriteRecipesCache.clear()
    this.suggestedRecipesCache = null
    console.log("[Meal Planner Cache] Cleared all caches")
  }
}

// Singleton instance
let cacheInstance: MealPlannerCache | null = null

/**
 * Get the global meal planner cache instance
 */
export function getMealPlannerCache(): MealPlannerCache {
  if (!cacheInstance) {
    cacheInstance = new MealPlannerCache()
  }
  return cacheInstance
}
