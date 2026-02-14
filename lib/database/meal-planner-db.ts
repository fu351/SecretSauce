
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"
import { Recipe, MealTypeTag } from "@/lib/types"
import { mealPlannerCache } from "./meal-planner-cache"
import { getWeek, getYear, eachDayOfInterval, parseISO } from "date-fns"

export type MealScheduleRow = Database["public"]["Tables"]["meal_schedule"]["Row"]
export type MealScheduleInsert = Database["public"]["Tables"]["meal_schedule"]["Insert"]
export type MealScheduleUpdate = Database["public"]["Tables"]["meal_schedule"]["Update"]

/**
 * Helper function to calculate week index from date
 * Format: YYYYWW (e.g., 202301 for week 1 of 2023)
 */
function getWeekIndex(date: Date): number {
  const year = getYear(date)
  const week = getWeek(date, { weekStartsOn: 1 })
  return year * 100 + week
}

/**
 * Helper function to get all week indices for a date range
 */
function getWeekIndicesForRange(startDate: string, endDate: string): number[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const allDates = eachDayOfInterval({ start, end })
  const weekIndices = allDates.map(getWeekIndex)
  return Array.from(new Set(weekIndices))
}

/**
 * Database operations for meal planning schedule
 * Singleton class extending BaseTable with specialized meal planning operations
 *
 * IMPORTANT: This table integrates with MealPlannerCache for performance
 * All mutations invalidate relevant cache keys
 */
class MealPlannerTable extends BaseTable<
  "meal_schedule",
  MealScheduleRow,
  MealScheduleInsert,
  MealScheduleUpdate
> {
  private static instance: MealPlannerTable | null = null
  readonly tableName = "meal_schedule" as const
  private cache = mealPlannerCache

  private constructor() {
    super()
  }

  static getInstance(): MealPlannerTable {
    if (!MealPlannerTable.instance) {
      MealPlannerTable.instance = new MealPlannerTable()
    }
    return MealPlannerTable.instance
  }

  /**
   * Fetch meal schedule entries for a specific date range
   * Uses week index optimization and cache
   */
  async fetchMealScheduleByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<MealScheduleRow[]> {
    const cached = this.cache.getMealScheduleCache(userId, startDate, endDate)
    if (cached) {
      return cached
    }

    const weekIndices = getWeekIndicesForRange(startDate, endDate)

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .in("week_index", weekIndices)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })

    if (error) {
      this.handleError(error, "fetchMealScheduleByDateRange")
      return []
    }

    const result = data || []
    this.cache.setMealScheduleCache(userId, startDate, endDate, result)
    return result
  }

  /**
   * Fetch meal schedule for a specific week index
   * Week index format: YYYYWW (e.g., 202301)
   */
  async fetchMealScheduleByWeekIndex(userId: string, weekIndex: number): Promise<MealScheduleRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("week_index", weekIndex)
      .order("date", { ascending: true })

    if (error) {
      this.handleError(error, "fetchMealScheduleByWeekIndex")
      return []
    }

    return data || []
  }

  /**
   * Fetch meal schedule for a specific date
   */
  async fetchMealScheduleByDate(userId: string, date: string): Promise<MealScheduleRow[]> {

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .order("meal_type", { ascending: true })

    if (error) {
      this.handleError(error, "fetchMealScheduleByDate")
      return []
    }

    return data || []
  }

  /**
   * Fetch recipes by their IDs (batch operation)
   * Uses cache for performance
   */
  async fetchRecipesByIds(recipeIds: string[]): Promise<Recipe[]> {
    if (recipeIds.length === 0) {
      return []
    }

    const cached = this.cache.getRecipesCache(recipeIds)
    if (cached) {
      return cached
    }

    const { data, error } = await this.supabase.from("recipes").select("*").in("id", recipeIds)

    if (error) {
      this.handleError(error, "fetchRecipesByIds")
      return []
    }

    const result = data || []
    this.cache.setRecipesCache(recipeIds, result)
    return result
  }

  /**
   * Add a meal to the schedule
   * Invalidates cache after successful insert
   */
  async addMealToSchedule(
    userId: string,
    recipeId: string,
    date: string,
    mealType: MealTypeTag
  ): Promise<MealScheduleRow | null> {

    const { data, error } = await (this.supabase.from(this.tableName) as any)
      .insert({
        user_id: userId,
        recipe_id: recipeId,
        date,
        meal_type: mealType,
      })
      .select()
      .single()

    if (error) {
      this.handleError(error, "addMealToSchedule")
      return null
    }

    // Invalidate meal schedule cache after adding
    if (data) {
      this.cache.invalidateMealScheduleCache(userId)
    }

    return data
  }

  /**
   * Update a meal in the schedule
   * Invalidates cache after successful update
   */
  async updateMealInSchedule(
    mealId: string,
    recipeId: string,
    mealType: MealTypeTag
  ): Promise<MealScheduleRow | null> {

    const { data, error } = await (this.supabase.from(this.tableName) as any)
      .update({
        recipe_id: recipeId,
        meal_type: mealType,
      })
      .eq("id", mealId)
      .select()
      .single()

    if (error) {
      this.handleError(error, "updateMealInSchedule")
      return null
    }

    // Invalidate meal schedule cache after updating
    if (data) {
      this.cache.invalidateMealScheduleCache((data as any).user_id)
    }

    return data
  }

  /**
   * Remove a meal from the schedule
   * Invalidates cache after successful deletion
   */
  async removeMealFromSchedule(mealId: string): Promise<boolean> {

    // Fetch the meal first to get userId for cache invalidation
    const { data: mealData } = await (this.supabase.from(this.tableName) as any)
      .select("user_id")
      .eq("id", mealId)
      .single()

    const { error } = await this.supabase.from(this.tableName).delete().eq("id", mealId)

    if (error) {
      this.handleError(error, "removeMealFromSchedule")
      return false
    }

    // Invalidate meal schedule cache after removing
    if (mealData) {
      this.cache.invalidateMealScheduleCache((mealData as any).user_id)
    }

    return true
  }

  /**
   * Remove all meals for a specific date and meal type
   * Invalidates cache after successful deletion
   */
  async removeMealSlot(
    userId: string,
    date: string,
    mealType: MealTypeTag
  ): Promise<boolean> {

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("user_id", userId)
      .eq("date", date)
      .eq("meal_type", mealType)

    if (error) {
      this.handleError(error, "removeMealSlot")
      return false
    }

    // Invalidate meal schedule cache after removing
    this.cache.invalidateMealScheduleCache(userId)

    return true
  }

  /**
   * Clear all meals for a specific week
   * Invalidates cache after successful deletion
   */
  async clearWeekSchedule(userId: string, weekIndex: number): Promise<boolean> {

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("user_id", userId)
      .eq("week_index", weekIndex)

    if (error) {
      this.handleError(error, "clearWeekSchedule")
      return false
    }

    // Invalidate meal schedule cache after clearing
    this.cache.invalidateMealScheduleCache(userId)

    return true
  }

  /**
   * Fetch suggested recipes
   * Uses cache for performance
   */
  async fetchSuggestedRecipes(limit: number = 20): Promise<Recipe[]> {
    const cached = this.cache.getSuggestedRecipesCache()
    if (cached) {
      return cached
    }

    const { data, error } = await this.supabase
      .from("recipes")
      .select("*")
      .limit(limit)
      .order("created_at", { ascending: false })

    if (error) {
      this.handleError(error, "fetchSuggestedRecipes")
      return []
    }

    const result = data || []
    this.cache.setSuggestedRecipesCache(result)
    return result
  }

  async bestStore(userId: string | null, recipeIds: string[], userZipCode?: string): Promise<any> {
    const { data, error } = await this.supabase
      .rpc("get_best_store_for_plan", {
        p_user_id: userId,
        p_recipe_ids: recipeIds,
        p_zip_code: userZipCode || null,
      })
      .single()

    if (error) {
      this.handleError(error, "bestStore")
      return null
    }

    return data
  }
}

// Export singleton instance
export const mealPlannerDB = MealPlannerTable.getInstance()
