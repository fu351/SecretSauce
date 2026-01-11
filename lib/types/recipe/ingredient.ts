import { StandardizedIngredient } from '../core/ingredient'

/**
 * Recipe Ingredient Type
 *
 * Represents an ingredient within a recipe with optional standardization metadata.
 * Used throughout the application for recipe displays, editing, and meal planning.
 *
 * Extends StandardizedIngredient with recipe-specific semantics.
 *
 * @see StandardizedIngredient - Base type with standardization fields
 * @see IngredientFormInput - Form input version with string amounts
 * @see ShoppingListIngredient - Shopping list extension with pricing and tracking
 *
 * @example
 * const ingredient: RecipeIngredient = {
 *   name: "chicken breast",
 *   quantity: 2,
 *   unit: "lbs",
 *   standardizedIngredientId: "abc123",
 *   standardizedName: "chicken breast"
 * }
 */
export type RecipeIngredient = StandardizedIngredient
