import type { StandardizedIngredient } from '../core/ingredient'

/**
 * Shopping List Ingredient Type
 *
 * Represents an ingredient on a shopping list with pricing, source tracking, and interaction state.
 * Extends StandardizedIngredient with shopping-specific metadata.
 *
 * Tracks whether items are from recipes or manual entries, includes pricing information,
 * and maintains state like whether the item has been "checked off" the list.
 *
 * @see StandardizedIngredient - Base type with standardization fields
 * @see ShoppingListItem - Deprecated alias for backward compatibility
 *
 * @example
 * const shoppingItem: ShoppingListIngredient = {
 *   id: "item-123",
 *   name: "chicken breast",
 *   quantity: 2,
 *   unit: "lbs",
 *   user_id: "user-456",
 *   checked: false,
 *   source_type: "recipe",
 *   recipe_title: "Chicken Parmesan",
 *   price: 8.99,
 *   store_name: "Whole Foods",
 *   category: "Meat",
 *   standardizedIngredientId: "std-789"
 * }
 */
export interface ShoppingListIngredient extends StandardizedIngredient {
  // Database identifiers
  id: string
  user_id: string

  // Quantity tracking
  quantity: number
  checked: boolean
  servings?: number | null

  // Source tracking
  source_type: ShoppingSourceType

  // Recipe-specific fields
  recipe_ingredient_index?: number | null
  recipe_title?: string
  recipe_id?: string

  // Ingredient and standardization
  ingredient_id?: string | null
  category?: string | null

  // Pricing and shopping metadata
  price?: number | null
  store_name?: string | null

  // Timestamps
  created_at?: string
  updated_at?: string
}

/**
 * @deprecated Use ShoppingListIngredient instead
 *
 * This type alias is maintained for backward compatibility during migration.
 * All new code should use ShoppingListIngredient.
 */
export type ShoppingListItem = ShoppingListIngredient

/**
 * Shopping Source Type
 *
 * Indicates whether a shopping list item comes from a recipe or was added manually.
 * Used to customize display and behavior in the shopping list UI.
 */
export type ShoppingSourceType = 'recipe' | 'manual'
