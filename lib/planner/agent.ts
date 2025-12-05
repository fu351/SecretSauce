import type { WeeklyDinnerPlan } from "./types"
import { listCandidateStores, getUserProfile } from "./data"
import { searchPriceAwareRecipes } from "./search"
import { estimateWeekBasketCost } from "./basket"
import { generateWeeklyDinnerPlanLLM } from "./llm"

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
  // Prefer LLM-driven planner if OPENAI_API_KEY is available; otherwise fall back to heuristic
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  if (hasOpenAI) {
    try {
      const llmPlan = await generateWeeklyDinnerPlanLLM(userId)
      if (llmPlan) return llmPlan
    } catch (error) {
      console.warn("[planner] LLM planner failed, falling back to heuristic", error)
    }
  }

  const profile = await getUserProfile(userId)
  const stores = await listCandidateStores(userId)
  const candidateStores = stores.length > 0 ? stores : [{ id: "walmart", name: "Walmart" }]

  let bestPlan: WeeklyDinnerPlan | null = null

  for (const store of candidateStores) {
    const hits = await searchPriceAwareRecipes("", {
      requiredStoreId: store.id,
      maxTimeMinutes: profile?.cookingTimePreference === "quick" ? 40 : undefined,
      dietType: profile?.dietaryPreferences?.[0],
      preferredCuisines: profile?.cuisinePreferences || [],
    }, 25)

    if (hits.length === 0) continue

    const selectedRecipeIds = pickVariedRecipes(hits, DAYS_IN_WEEK)
    if (selectedRecipeIds.length < DAYS_IN_WEEK) continue

    const basket = await estimateWeekBasketCost({
      userId,
      storeId: store.id,
      recipeIds: selectedRecipeIds,
      servingsPerRecipe: 1,
    })

    const plan: WeeklyDinnerPlan = {
      storeId: store.id,
      totalCost: basket.totalCost,
      dinners: selectedRecipeIds.map((recipeId, idx) => ({ dayIndex: idx, recipeId })),
      explanation: buildExplanation(store.id, basket.totalCost, basket.mainProteinCounts),
    }

    if (!bestPlan || plan.totalCost < bestPlan.totalCost) {
      bestPlan = plan
    }
  }

  if (!bestPlan) {
    return {
      storeId: candidateStores[0].id,
      totalCost: 0,
      dinners: [],
      explanation: "No suitable recipes found for the requested week.",
    }
  }

  return bestPlan
}
