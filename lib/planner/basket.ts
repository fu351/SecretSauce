import type { BasketCostResult, WeeklyPlanInput } from "./types"
import { getRecipesByIds, getUserPantry, getCheapestStoreItem } from "./data"

type IngredientDemand = {
  name: string
  unit?: string | null
  quantity: number
  standardizedIngredientId?: string | null
}

const buildIngredientKey = (name: string, unit?: string | null) =>
  `${name.trim().toLowerCase()}::${(unit || "").trim().toLowerCase() || "unit"}`

const normalizeProteinTag = (name: string) => {
  const lower = name.toLowerCase()
  if (lower.includes("chicken")) return "chicken"
  if (lower.includes("beef")) return "beef"
  if (lower.includes("pork")) return "pork"
  if (lower.includes("tofu")) return "tofu"
  if (lower.includes("turkey")) return "turkey"
  if (lower.includes("salmon") || lower.includes("fish")) return "fish"
  if (lower.includes("bean") || lower.includes("lentil")) return "legume"
  if (lower.includes("egg")) return "egg"
  return "other"
}

export async function estimateWeekBasketCost(input: WeeklyPlanInput): Promise<BasketCostResult> {
  const recipes = await getRecipesByIds(input.recipeIds)
  const pantry = await getUserPantry(input.userId)

  const demand = new Map<string, IngredientDemand>()
  const mainProteinCounts: Record<string, number> = {}

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ing) => {
      if (!ing.name) return
      const key = buildIngredientKey(ing.name, ing.unit)
      const current = demand.get(key) || {
        name: ing.name,
        unit: ing.unit,
        quantity: 0,
        standardizedIngredientId: ing.standardizedIngredientId,
      }
      const amount = Number(ing.amount ?? 1) * (input.servingsPerRecipe || 1) / (recipe.servings || 1)
      current.quantity += Number.isFinite(amount) ? amount : 1
      demand.set(key, current)

      const proteinTag = normalizeProteinTag(ing.name)
      mainProteinCounts[proteinTag] = (mainProteinCounts[proteinTag] || 0) + 1
    })
  })

  // Subtract pantry quantities
  pantry.forEach((item) => {
    const key = buildIngredientKey(item.name, item.unit)
    if (!demand.has(key)) return
    const demandItem = demand.get(key)!
    demandItem.quantity = Math.max(0, demandItem.quantity - (item.quantity || 0))
    demand.set(key, demandItem)
  })

  const perIngredientCost: Record<string, number> = {}
  const perIngredientUnused: Record<string, number> = {}
  let totalCost = 0

  for (const entry of demand.values()) {
    if (entry.quantity <= 0) continue

    const priced = await getCheapestStoreItem(input.storeId, {
      name: entry.name,
      standardizedIngredientId: entry.standardizedIngredientId,
    })

    if (!priced) continue

    const packagesNeeded = Math.max(1, Math.ceil(entry.quantity / priced.quantity))
    const ingredientCost = packagesNeeded * priced.price
    const unused = packagesNeeded * priced.quantity - entry.quantity

    perIngredientCost[entry.name] = ingredientCost
    perIngredientUnused[entry.name] = unused
    totalCost += ingredientCost
  }

  return {
    totalCost: Number(totalCost.toFixed(2)),
    perIngredientCost,
    perIngredientUnused,
    mainProteinCounts,
  }
}
