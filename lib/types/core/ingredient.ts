/**
 * Base Ingredient Type
 *
 * Minimal ingredient data structure used as the foundation for all ingredient variants.
 * Extended by domain-specific types (RecipeIngredient, IngredientFormInput, ShoppingListIngredient).
 */
export interface BaseIngredient {
  name: string
  quantity?: number
  unit?: string
}

/**
 * Standardized Ingredient Type
 *
 * Extends BaseIngredient with standardization metadata.
 * Links ingredients to a standardized ingredient database for consistency across recipes.
 * Used as the base for most ingredient variants in the application.
 */
export interface StandardizedIngredient extends BaseIngredient {
  standardizedIngredientId?: string
  standardizedName?: string
}
