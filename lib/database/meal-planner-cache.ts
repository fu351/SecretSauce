
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
  }

  /**
   * Get or set recipes cache
   */
  getRecipesCache(recipeIds: string[]): Recipe[] | null {
    if (recipeIds.length === 0) return []

    const key = this.getRecipesKey(recipeIds)
    const cached = this.recipesCache.get(key)

    if (cached && this.isValid(cached)) {
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
  }

  /**
   * Get or set favorite recipes cache
   */
  getFavoriteRecipesCache(userId: string): Recipe[] | null {
    const cached = this.favoriteRecipesCache.get(userId)

    if (cached && this.isValid(cached)) {
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

  }

  /**
   * Get or set suggested recipes cache
   */
  getSuggestedRecipesCache(): Recipe[] | null {
    if (this.suggestedRecipesCache && this.isValid(this.suggestedRecipesCache)) {
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

  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.mealScheduleCache.clear()
    this.recipesCache.clear()
    this.favoriteRecipesCache.clear()
    this.suggestedRecipesCache = null
  }
}

/**
 * Singleton instance using the same pattern as database classes
 * Backwards compatible with getMealPlannerCache() function
 */
let cacheInstance: MealPlannerCache | null = null

/**
 * Get the global meal planner cache instance
 * @deprecated Use mealPlannerCache singleton instance instead
 */
export function getMealPlannerCache(): MealPlannerCache {
  if (!cacheInstance) {
    cacheInstance = new MealPlannerCache()
  }
  return cacheInstance
}

/**
 * Singleton instance export for consistency with other DB files
 * This is the preferred way to access the cache
 */
export const mealPlannerCache = getMealPlannerCache()
