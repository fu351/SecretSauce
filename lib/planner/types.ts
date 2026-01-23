import type { Database } from "@/lib/database/supabase"

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
export type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"]
export type PantryRow = Database["public"]["Tables"]["pantry_items"]["Row"]

export type UserProfile = {
  id: string
  email: string
  budgetRange?: ProfileRow["budget_range"] | null
  dietaryPreferences?: string[] | null
  cuisinePreferences?: string[] | null
  cookingTimePreference?: ProfileRow["cooking_time_preference"] | null
  primaryGoal?: ProfileRow["primary_goal"] | null
  groceryZip?: string | null
  groceryDistanceMiles?: number | null
}

export type PantryItem = {
  id: string
  name: string
  quantity: number
  unit?: string | null
  standardizedIngredientId?: string | null
}

export type Store = {
  id: string
  name: string
  zipCode?: string | null
}

export type RecipeIngredient = {
  name: string
  amount?: number
  unit?: string
  standardizedIngredientId?: string | null
}

export type Recipe = {
  id: string
  title: string
  description?: string | null
  servings: number
  prepTimeMinutes?: number | null
  cookTimeMinutes?: number | null
  dietaryTags?: string[] | null
  ingredients: RecipeIngredient[]
  nutrition?: any
  dietaryFlags?: Record<string, any> | null
  proteinTag?: string | null
  cuisine?: string | null  // User-provided cuisine
  cuisineGuess?: string | null  // AI-inferred cuisine (fallback)
}

export type StoreItem = {
  storeId: string
  standardizedIngredientId: string
  name: string
  price: number
  quantity: number
  unit: string
  productId?: string | null
  productName?: string | null
}

export type RecipeSearchFilters = {
  maxTimeMinutes?: number
  dietType?: string
  excludedIngredients?: string[]
  requiredStoreId?: string
  maxEstimatedCostPerServing?: number
  likedTags?: string[]
  avoidTags?: string[]
  pantryItems?: PantryItem[]
  targetBudgetPerServing?: number
  preferredCuisines?: string[]
}

export type PriceAwareRecipeHit = {
  recipeId: string
  storeId: string
  estimatedCostPerServing: number
  timeMinutes?: number
  mainProteinTag?: string
  nutrition?: any
  pantryMatchScore?: number
}

export type WeeklyPlanInput = {
  userId: string
  storeId: string
  recipeIds: string[]
  servingsPerRecipe: number
}

export type BasketCostResult = {
  totalCost: number
  perIngredientCost: Record<string, number>
  perIngredientUnused: Record<string, number>
  mainProteinCounts: Record<string, number>
  dailyProtein?: number[]
}

export type WeeklyMealPlan = {
  storeId: string
  totalCost: number
  meals: Array<{ dayIndex: number; mealType: 'breakfast' | 'lunch' | 'dinner'; recipeId: string }>
  explanation: string
}

// Legacy type for backwards compatibility
export type WeeklyDinnerPlan = WeeklyMealPlan
