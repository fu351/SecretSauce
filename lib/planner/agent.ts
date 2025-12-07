import type { WeeklyDinnerPlan, Recipe } from "./types"
import { listCandidateStores, getUserProfile } from "./data"
import { searchPriceAwareRecipes } from "./search"
import { estimateWeekBasketCost } from "./basket"
import { generateWeeklyDinnerPlanLLM } from "./llm"
import { createServerClient } from "@/lib/supabase"

const DAYS_IN_WEEK = 7

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

export async function generateWeeklyDinnerPlan(userId: string): Promise<WeeklyDinnerPlan> {
  const startTime = Date.now()
  console.log("[planner] Starting weekly dinner plan generation")

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

  let query = client
    .from("recipes")
    .select("id, title, protein_tag, cuisine, cuisine_guess, prep_time, cook_time, dietary_tags")
    .limit(50)

  if (profile?.cookingTimePreference === "quick") {
    query = query.or("prep_time.lte.20,cook_time.lte.20")
  }

  const { data: recipes, error } = await query

  if (error || !recipes || recipes.length === 0) {
    return {
      storeId: "walmart",
      totalCost: 0,
      dinners: [],
      explanation: "No suitable recipes found.",
    }
  }

  // Score recipes by user preferences
  const scoredRecipes = recipes.map(recipe => {
    let score = 0
    const cuisine = recipe.cuisine || recipe.cuisine_guess || ""
    if (profile?.cuisinePreferences?.length) {
      const cuisineMatch = profile.cuisinePreferences.some(
        (pref: string) => cuisine.toLowerCase().includes(pref.toLowerCase())
      )
      if (cuisineMatch) score += 10
    }
    return { ...recipe, score }
  }).sort((a, b) => b.score - a.score)

  // Pick 7 recipes with protein variety
  const selectedRecipes: string[] = []
  const usedProteins = new Set<string>()

  for (const recipe of scoredRecipes) {
    if (selectedRecipes.length >= DAYS_IN_WEEK) break
    const protein = recipe.protein_tag || "other"
    if (!usedProteins.has(protein) || usedProteins.size >= 4) {
      selectedRecipes.push(recipe.id)
      usedProteins.add(protein)
    }
  }

  const shuffledRecipes = shuffle(scoredRecipes)
  while (selectedRecipes.length < DAYS_IN_WEEK && shuffledRecipes.length > 0) {
    selectedRecipes.push(shuffledRecipes.shift()!.id)
  }

  while (selectedRecipes.length < DAYS_IN_WEEK && selectedRecipes.length > 0) {
    selectedRecipes.push(selectedRecipes[selectedRecipes.length % selectedRecipes.length])
  }

  // Estimate costs (cache-only)
  const candidateStores = stores.length > 0 ? stores : [{ id: "walmart", name: "Walmart" }]
  let bestPlan: WeeklyDinnerPlan | null = null

  for (const store of candidateStores.slice(0, 2)) {
    try {
      const basket = await estimateWeekBasketCost({
        userId,
        storeId: store.id,
        recipeIds: selectedRecipes.slice(0, DAYS_IN_WEEK),
        servingsPerRecipe: 1,
      })

      const plan: WeeklyDinnerPlan = {
        storeId: store.id,
        totalCost: basket.totalCost,
        dinners: selectedRecipes.slice(0, DAYS_IN_WEEK).map((recipeId, idx) => ({ dayIndex: idx, recipeId })),
        explanation: buildExplanation(store.id, basket.totalCost, basket.mainProteinCounts),
      }

      if (!bestPlan || plan.totalCost < bestPlan.totalCost) {
        bestPlan = plan
      }
    } catch (err) {
      console.warn(`[planner] Cost estimation failed for ${store.id}`, err)
    }
  }

  console.log(`[planner] Completed in ${Date.now() - startTime}ms`)

  if (!bestPlan) {
    return {
      storeId: candidateStores[0]?.id || "walmart",
      totalCost: 0,
      dinners: selectedRecipes.slice(0, DAYS_IN_WEEK).map((recipeId, idx) => ({ dayIndex: idx, recipeId })),
      explanation: `Plan generated based on your preferences.`,
    }
  }

  return bestPlan
}
