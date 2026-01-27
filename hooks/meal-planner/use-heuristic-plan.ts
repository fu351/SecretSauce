import { recipeDB } from "@/lib/database/recipe-db"
import { mealPlannerDB } from "@/lib/database/meal-planner-db"
import { profileDB } from "@/lib/database/profile-db"
import type { MealTypeTag, Recipe } from "@/lib/types"

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const
type PlannerMealType = typeof MEAL_TYPES[number]

interface WeeklyMealPlan extends Recipe {
    storeId: string
}

export async function useHeuristicPlan(userId: string, weekIndex?: number): Promise<WeeklyMealPlan[]> {
  // 1. Gather Context
  const [existingSchedule, profileFields] = await Promise.all([
    fetchExistingSchedule(userId, weekIndex),
    profileDB.fetchProfileFields(userId, ["zip_code"]),
  ])

  const userZipCode = profileFields?.zip_code || undefined

  const existingRecipeIds = existingSchedule.map(s => s.recipe_id).filter(Boolean)

  // 2. Identify Open Slots
  const slotsNeeded = getOpenSlotsMap(existingSchedule)
  const totalSlots = Object.values(slotsNeeded).reduce((a, b) => a + b, 0)

  if (totalSlots === 0) {
    return { storeId: "walmart", totalCost: 0, meals: [], explanation: "Week fully planned." }
  }

  // 3. Fetch Recipes (RPC 1: Logic & Filtering)
  // Calls 'recommend_recipes_smart' we defined previously
  const recsByType = await Promise.all(
    MEAL_TYPES.map(async (type) => {
      const count = slotsNeeded[type]
      if (count === 0) return { type, recipes: [] }

      return {
        type,
        recipes: await recipeDB.getSmartRecommendationsByMealType(
          userId,
          count + 5, // Small buffer
          type
        )
      }
    })
  )

  // 4. Build the Meal List
  const recipeMap = new Map(recsByType.map(r => [r.type, r.recipes]))
  const plannedMeals: Array<{ dayIndex: number; mealType: MealTypeTag; recipeId: string }> = []
  const usedRecipes = new Set<string>(existingRecipeIds)

  for (let day = 0; day < 7; day++) {
    for (const type of MEAL_TYPES) {
      const isTaken = existingSchedule.some(s => s.dayIndex === day && s.meal_type === type)
      if (!isTaken) {
        // Pop a recipe
        const pool = recipeMap.get(type) || []
        const selection = pool.find(r => !usedRecipes.has(r.id))
        
        if (selection) {
          plannedMeals.push({ dayIndex: day, mealType: type, recipeId: selection.id })
          usedRecipes.add(selection.id)
        }
      }
    }
  }

  // 5. Select Store & Estimate Cost (RPC 2: Pricing & Location)
  // Replaces the entire JS loop and 'estimateWeekBasketCost' function
  const allRecipeIds = plannedMeals.map(m => m.recipeId)

  // UPDATED: Pass p_zip_code to ensure we hit the correct ingredients_cache
  const bestStore = await mealPlannerDB.bestStore(
    userId,
    allRecipeIds,
    userZipCode,
  )

  // Fallback if cache is empty for this zip
  if (!bestStore) {
    return {
      storeId: "walmart",
      totalCost: 0,
      meals: plannedMeals,
      explanation: "Plan generated. Local pricing unavailable for your zip code."
    }
  }

  return {
    storeId: bestStore.store_id,
    totalCost: bestStore.total_cost,
    meals: plannedMeals,
    explanation: `Best price at ${bestStore.store_name} ($${bestStore.total_cost}).`
  }
}

// --- Helpers ---

function getOpenSlotsMap(existingSchedule: any[]): Record<PlannerMealType, number> {
  const counts: Record<PlannerMealType, number> = { breakfast: 7, lunch: 7, dinner: 7 }
  existingSchedule.forEach((s: any) => {
    const mealType = s.meal_type as PlannerMealType
    if (mealType in counts) {
      counts[mealType]--
    }
  })
  return counts
}

async function fetchExistingSchedule(userId: string, weekIndex?: number) {
  if (!weekIndex) return []

  const data = await mealPlannerDB.fetchMealScheduleByWeekIndex(userId, weekIndex)

  if (!data || data.length === 0) return []

  // Quick date mapper (assuming ISO strings in DB)
  return data.map((item: any) => ({
    ...item,
    dayIndex: new Date(item.date).getDay()
  }))
}
