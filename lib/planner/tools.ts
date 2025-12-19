import { getUserProfile, getUserPantry, listCandidateStores, getRecipeById } from "./data"
import { searchPriceAwareRecipes } from "./search"
import { estimateWeekBasketCost } from "./basket"
import { getTasteHistory } from "./taste"

export async function tool_get_user_profile(args: { userId: string }) {
  return getUserProfile(args.userId)
}

export async function tool_get_user_pantry(args: { userId: string }) {
  return getUserPantry(args.userId)
}

export async function tool_list_candidate_stores(args: { userId?: string }) {
  return listCandidateStores(args.userId)
}

export async function tool_get_recipe(args: { recipeId: string }) {
  return getRecipeById(args.recipeId)
}

export async function tool_search_price_aware_recipes(args: {
  query: string
  filters: any
  limit: number
}) {
  return searchPriceAwareRecipes(args.query, args.filters, args.limit)
}

export async function tool_estimate_week_basket_cost(args: {
  userId: string
  storeId: string
  recipeIds: string[]
  servingsPerRecipe: number
}) {
  return estimateWeekBasketCost({
    userId: args.userId,
    storeId: args.storeId,
    recipeIds: args.recipeIds,
    servingsPerRecipe: args.servingsPerRecipe,
  })
}

export async function tool_get_taste_history(args: { userId: string }) {
  return getTasteHistory(args.userId)
}
