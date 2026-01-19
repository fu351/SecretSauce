import type { WeeklyDinnerPlan, WeeklyMealPlan, Recipe } from "./types"
import { listCandidateStores, getUserProfile } from "./data"
import { searchPriceAwareRecipes } from "./search"
import { estimateWeekBasketCost } from "./basket"
import { generateWeeklyDinnerPlanLLM } from "./llm"
import { createServerClient } from "@/lib/supabase"
import { getDatesForWeek } from "@/lib/date-utils"

const DAYS_IN_WEEK = 7
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const

const shuffle = <T>(arr: T[]) => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const groupByProtein = (hits: Awaited<ReturnType<typeof searchPriceAwareRecipes>>) => {
  const groups = new Map<string, typeof hits>()
  hits.forEach((hit) => {
    const key = hit.mainProteinTag || "other"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(hit)
  })
  return groups
}

const pickVariedRecipes = (
  hits: Awaited<ReturnType<typeof searchPriceAwareRecipes>>,
  count: number
): string[] => {
  const groups = groupByProtein(hits)
  const order = shuffle(Array.from(groups.keys()))
  const result: string[] = []

  // ensure at least two protein groups if available
  order.forEach((protein) => {
    const best = groups.get(protein)?.sort((a, b) => a.estimatedCostPerServing - b.estimatedCostPerServing)[0]
    if (best && result.length < count) {
      result.push(best.recipeId)
    }
  })

  const remaining = hits
    .sort((a, b) => a.estimatedCostPerServing - b.estimatedCostPerServing)
    .filter((hit) => !result.includes(hit.recipeId))
    .slice(0, count - result.length)
    .map((hit) => hit.recipeId)

  return [...result, ...remaining].slice(0, count)
}

const buildExplanation = (storeId: string, cost: number, proteinSummary: Record<string, number>) => {
  const proteins = Object.entries(proteinSummary)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .map(([protein, count]) => `${protein} (${count})`)
    .join(", ")

  return `Chose ${storeId} as the single store with lowest estimated basket. Total estimated cost $${cost.toFixed(
    2
  )}. Protein mix: ${proteins || "mixed"}.`
}

export async function generateWeeklyDinnerPlan(userId: string, weekIndex?: number): Promise<WeeklyMealPlan> {
  const startTime = Date.now()
  console.log("[planner] Starting weekly meal plan generation")

  // Try LLM planner first (optimized for speed)
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  if (hasOpenAI) {
    try {
      const llmPlan = await generateWeeklyDinnerPlanLLM(userId)
      if (llmPlan) {
        console.log(`[planner] LLM plan completed in ${Date.now() - startTime}ms`)
        return llmPlan
      }
    } catch (error) {
      console.warn("[planner] LLM planner failed, falling back to heuristic", error)
    }
  }

  // FALLBACK: Fast heuristic-based planner
  console.log("[planner] Using fast heuristic fallback")
  const profile = await getUserProfile(userId)
  const stores = await listCandidateStores(userId)
  const client = createServerClient()

  // Fetch existing meals for the week to avoid overwriting
  const weekDates = weekIndex ? getDatesForWeek(weekIndex).map(d => d.toISOString().split('T')[0]) : []
  const existingMeals = new Set<string>()

  if (weekIndex) {
    const { data: scheduledMeals } = await client
      .from("meal_schedule")
      .select("date, meal_type")
      .eq("user_id", userId)
      .eq("week_index", weekIndex)

    scheduledMeals?.forEach((meal: any) => {
      const dayIndex = weekDates.indexOf(meal.date)
      if (dayIndex !== -1) {
        existingMeals.add(`${dayIndex}-${meal.meal_type}`)
      }
    })
  }

  let query = client
    .from("recipes")
    .select("id, title, protein, cuisine, prep_time, cook_time, tags")
    .is("deleted_at", null)
    .limit(50)

  if (profile?.cookingTimePreference === "quick") {
    query = query.or("prep_time.lte.20,cook_time.lte.20")
  }

  const { data: recipes, error } = await query

  if (error || !recipes || recipes.length === 0) {
    return {
      storeId: "walmart",
      totalCost: 0,
      meals: [],
      explanation: "No suitable recipes found.",
    }
  }

  // Score recipes by user preferences
  const scoredRecipes = recipes.map(recipe => {
    let score = 0
    const cuisine = recipe.cuisine || ""
    if (profile?.cuisinePreferences?.length) {
      const cuisineMatch = profile.cuisinePreferences.some(
        (pref: string) => cuisine.toLowerCase().includes(pref.toLowerCase())
      )
      if (cuisineMatch) score += 10
    }
    return { ...recipe, score }
  }).sort((a, b) => b.score - a.score)

  // Build meal plan for all meal types across the week
  const plannedMeals: Array<{ dayIndex: number; mealType: 'breakfast' | 'lunch' | 'dinner'; recipeId: string }> = []
  const usedRecipes = new Set<string>()
  let recipePool = [...scoredRecipes]

  for (let dayIndex = 0; dayIndex < DAYS_IN_WEEK; dayIndex++) {
    for (const mealType of MEAL_TYPES) {
      const slotKey = `${dayIndex}-${mealType}`

      // Skip if this slot already has a meal
      if (existingMeals.has(slotKey)) {
        continue
      }

      // Find a recipe we haven't used yet
      let selectedRecipe = recipePool.find(r => !usedRecipes.has(r.id))

      // If we've used all recipes, shuffle and reuse
      if (!selectedRecipe) {
        recipePool = shuffle(scoredRecipes)
        usedRecipes.clear()
        selectedRecipe = recipePool[0]
      }

      if (selectedRecipe) {
        plannedMeals.push({
          dayIndex,
          mealType,
          recipeId: selectedRecipe.id
        })
        usedRecipes.add(selectedRecipe.id)
      }
    }
  }

  // Get all unique recipes for cost estimation
  const allRecipeIds = [...new Set(plannedMeals.map(m => m.recipeId))]

  // Estimate costs (cache-only)
  const candidateStores = stores.length > 0 ? stores : [{ id: "walmart", name: "Walmart" }]
  let bestPlan: WeeklyMealPlan | null = null

  for (const store of candidateStores.slice(0, 2)) {
    try {
      const basket = await estimateWeekBasketCost({
        userId,
        storeId: store.id,
        recipeIds: allRecipeIds,
        servingsPerRecipe: 1,
      })

      const plan: WeeklyMealPlan = {
        storeId: store.id,
        totalCost: basket.totalCost,
        meals: plannedMeals,
        explanation: buildExplanation(store.id, basket.totalCost, basket.mainProteinCounts),
      }

      if (!bestPlan || plan.totalCost < bestPlan.totalCost) {
        bestPlan = plan
      }
    } catch (err) {
      console.warn(`[planner] Cost estimation failed for ${store.id}`, err)
    }
  }

  console.log(`[planner] Completed in ${Date.now() - startTime}ms - ${plannedMeals.length} meals planned`)

  if (!bestPlan) {
    return {
      storeId: candidateStores[0]?.id || "walmart",
      totalCost: 0,
      meals: plannedMeals,
      explanation: `Plan generated with ${plannedMeals.length} meals based on your preferences.`,
    }
  }

  return bestPlan
}
