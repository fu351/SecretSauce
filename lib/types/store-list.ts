import { Ingredient  } from "./recipe"

export interface ShoppingListItem extends Ingredient {
  id: string
  user_id: string
  quantity: number
  checked: boolean
  servings?: number | null

  // Source tracking
  source_type: ShoppingSourceType

  // Recipe-specific fields
  recipe_ingredient_index?: number | null
  recipe_title?: string

  // Ingredient and standardization
  ingredient_id?: string | null
  standardizedName?: string
  recipe_id?: string

  // Pricing and shopping metadata
  price?: number | null
  store_name?: string | null

  // Timestamps
  created_at?: string
  updated_at?: string
}


export type PantryItemInfo = {
  id: string
  quantity: number
  unit: string | null
  standardized_ingredient_id?: string | null
  standardized_name?: string | null
}

// constants

export type ShoppingSourceType = 'recipe' | 'manual'