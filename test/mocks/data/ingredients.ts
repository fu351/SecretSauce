import type { RecipeIngredient } from '@/lib/types/recipe/ingredient'
import type { StandardizedIngredient } from '@/lib/types/core/ingredient'

/**
 * Standard ingredient with full standardization metadata
 */
export const mockStandardizedIngredient: StandardizedIngredient = {
  name: 'chicken breast',
  quantity: 2,
  unit: 'pounds',
  standardizedIngredientId: 'ingredient-chicken-001',
  standardizedName: 'chicken breast',
}

/**
 * Recipe ingredient without standardization (raw user input)
 */
export const mockRawIngredient: RecipeIngredient = {
  name: 'chopped onion',
  quantity: 1,
  unit: 'medium',
}

/**
 * Ingredient with no quantity specified
 */
export const mockIngredientNoQuantity: RecipeIngredient = {
  name: 'salt and pepper',
  unit: 'to taste',
}

/**
 * Array of common baking ingredients used in multiple recipes
 */
export const mockBakingIngredients: RecipeIngredient[] = [
  {
    name: 'all-purpose flour',
    quantity: 2,
    unit: 'cups',
    standardizedIngredientId: 'flour-001',
    standardizedName: 'all-purpose flour',
  },
  {
    name: 'sugar',
    quantity: 1,
    unit: 'cup',
    standardizedIngredientId: 'sugar-001',
    standardizedName: 'sugar',
  },
  {
    name: 'butter',
    quantity: 1,
    unit: 'cup',
    standardizedIngredientId: 'butter-001',
    standardizedName: 'butter',
  },
  {
    name: 'eggs',
    quantity: 3,
    unit: 'whole',
    standardizedIngredientId: 'egg-001',
    standardizedName: 'eggs',
  },
  {
    name: 'vanilla extract',
    quantity: 1,
    unit: 'teaspoon',
    standardizedIngredientId: 'vanilla-001',
    standardizedName: 'vanilla extract',
  },
  {
    name: 'baking powder',
    quantity: 1.5,
    unit: 'teaspoons',
    standardizedIngredientId: 'baking-powder-001',
    standardizedName: 'baking powder',
  },
  {
    name: 'salt',
    quantity: 0.5,
    unit: 'teaspoon',
    standardizedIngredientId: 'salt-001',
    standardizedName: 'salt',
  },
]

/**
 * Array of common produce ingredients
 */
export const mockProduceIngredients: RecipeIngredient[] = [
  {
    name: 'tomato',
    quantity: 3,
    unit: 'whole',
    standardizedIngredientId: 'tomato-001',
    standardizedName: 'tomato',
  },
  {
    name: 'garlic',
    quantity: 4,
    unit: 'cloves',
    standardizedIngredientId: 'garlic-001',
    standardizedName: 'garlic',
  },
  {
    name: 'onion',
    quantity: 2,
    unit: 'medium',
    standardizedIngredientId: 'onion-001',
    standardizedName: 'onion',
  },
  {
    name: 'bell pepper',
    quantity: 1,
    unit: 'whole',
    standardizedIngredientId: 'pepper-001',
    standardizedName: 'bell pepper',
  },
  {
    name: 'broccoli',
    quantity: 2,
    unit: 'cups',
    standardizedIngredientId: 'broccoli-001',
    standardizedName: 'broccoli',
  },
  {
    name: 'spinach',
    quantity: 4,
    unit: 'cups',
    standardizedIngredientId: 'spinach-001',
    standardizedName: 'spinach',
  },
]

/**
 * Protein-based ingredients for various recipes
 */
export const mockProteinIngredients: RecipeIngredient[] = [
  {
    name: 'chicken breast',
    quantity: 2,
    unit: 'pounds',
    standardizedIngredientId: 'chicken-001',
    standardizedName: 'chicken breast',
  },
  {
    name: 'ground beef',
    quantity: 1,
    unit: 'pound',
    standardizedIngredientId: 'beef-001',
    standardizedName: 'ground beef',
  },
  {
    name: 'salmon fillet',
    quantity: 4,
    unit: 'oz',
    standardizedIngredientId: 'salmon-001',
    standardizedName: 'salmon',
  },
  {
    name: 'tofu',
    quantity: 1,
    unit: 'block',
    standardizedIngredientId: 'tofu-001',
    standardizedName: 'tofu',
  },
  {
    name: 'eggs',
    quantity: 6,
    unit: 'whole',
    standardizedIngredientId: 'egg-001',
    standardizedName: 'eggs',
  },
  {
    name: 'black beans',
    quantity: 2,
    unit: 'cans',
    standardizedIngredientId: 'beans-001',
    standardizedName: 'black beans',
  },
]

/**
 * Spices and seasonings
 */
export const mockSeasoningIngredients: RecipeIngredient[] = [
  {
    name: 'salt',
    unit: 'to taste',
    standardizedIngredientId: 'salt-001',
    standardizedName: 'salt',
  },
  {
    name: 'black pepper',
    unit: 'to taste',
    standardizedIngredientId: 'pepper-001',
    standardizedName: 'black pepper',
  },
  {
    name: 'cumin',
    quantity: 1,
    unit: 'teaspoon',
    standardizedIngredientId: 'cumin-001',
    standardizedName: 'cumin',
  },
  {
    name: 'paprika',
    quantity: 1,
    unit: 'tablespoon',
    standardizedIngredientId: 'paprika-001',
    standardizedName: 'paprika',
  },
  {
    name: 'garlic powder',
    quantity: 0.5,
    unit: 'teaspoon',
    standardizedIngredientId: 'garlic-powder-001',
    standardizedName: 'garlic powder',
  },
  {
    name: 'thyme',
    quantity: 1,
    unit: 'tablespoon',
    standardizedIngredientId: 'thyme-001',
    standardizedName: 'thyme',
  },
  {
    name: 'oregano',
    quantity: 1,
    unit: 'tablespoon',
    standardizedIngredientId: 'oregano-001',
    standardizedName: 'oregano',
  },
]

/**
 * Dairy and substitutes
 */
export const mockDairyIngredients: RecipeIngredient[] = [
  {
    name: 'whole milk',
    quantity: 2,
    unit: 'cups',
    standardizedIngredientId: 'milk-001',
    standardizedName: 'milk',
  },
  {
    name: 'butter',
    quantity: 0.5,
    unit: 'cup',
    standardizedIngredientId: 'butter-001',
    standardizedName: 'butter',
  },
  {
    name: 'cheddar cheese',
    quantity: 1,
    unit: 'cup',
    standardizedIngredientId: 'cheese-001',
    standardizedName: 'cheddar cheese',
  },
  {
    name: 'greek yogurt',
    quantity: 1,
    unit: 'cup',
    standardizedIngredientId: 'yogurt-001',
    standardizedName: 'greek yogurt',
  },
  {
    name: 'sour cream',
    quantity: 0.5,
    unit: 'cup',
    standardizedIngredientId: 'sour-cream-001',
    standardizedName: 'sour cream',
  },
]

/**
 * Common condiments and pantry staples
 */
export const mockCondimentIngredients: RecipeIngredient[] = [
  {
    name: 'olive oil',
    quantity: 3,
    unit: 'tablespoons',
    standardizedIngredientId: 'olive-oil-001',
    standardizedName: 'olive oil',
  },
  {
    name: 'soy sauce',
    quantity: 2,
    unit: 'tablespoons',
    standardizedIngredientId: 'soy-sauce-001',
    standardizedName: 'soy sauce',
  },
  {
    name: 'vinegar',
    quantity: 1,
    unit: 'tablespoon',
    standardizedIngredientId: 'vinegar-001',
    standardizedName: 'vinegar',
  },
  {
    name: 'honey',
    quantity: 2,
    unit: 'tablespoons',
    standardizedIngredientId: 'honey-001',
    standardizedName: 'honey',
  },
  {
    name: 'ketchup',
    quantity: 0.5,
    unit: 'cup',
    standardizedIngredientId: 'ketchup-001',
    standardizedName: 'ketchup',
  },
]

/**
 * Mapping from raw ingredient name to standardized version
 * Useful for testing ingredient standardization lookups
 */
export const ingredientMappings: Record<string, string> = {
  'chopped onion': 'onion',
  'diced onion': 'onion',
  'ground chicken': 'chicken',
  'shredded cheddar': 'cheddar cheese',
  'kosher salt': 'salt',
  'sea salt': 'salt',
  'cracked pepper': 'black pepper',
  'minced garlic': 'garlic',
  'fresh garlic': 'garlic',
  'extra virgin olive oil': 'olive oil',
  'vegetable oil': 'oil',
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  'all purpose flour': 'all-purpose flour',
  'whole wheat flour': 'whole wheat flour',
  'granulated sugar': 'sugar',
  'brown sugar': 'brown sugar',
  'free range eggs': 'eggs',
  'organic tomato': 'tomato',
}

/**
 * Cached ingredient prices for different stores
 * Used to test ingredient pricing calculations
 */
export const mockCachedPrices: Record<string, Record<string, number>> = {
  'chicken-001': {
    'kroger': 8.99,
    'whole-foods': 12.99,
    'trader-joes': 10.99,
  },
  'tomato-001': {
    'kroger': 2.49,
    'whole-foods': 3.49,
    'trader-joes': 2.99,
  },
  'onion-001': {
    'kroger': 0.79,
    'whole-foods': 1.29,
    'trader-joes': 0.99,
  },
  'butter-001': {
    'kroger': 4.99,
    'whole-foods': 6.49,
    'trader-joes': 5.99,
  },
  'olive-oil-001': {
    'kroger': 7.99,
    'whole-foods': 9.99,
    'trader-joes': 8.49,
  },
  'salt-001': {
    'kroger': 1.99,
    'whole-foods': 2.49,
    'trader-joes': 1.99,
  },
  'garlic-001': {
    'kroger': 0.99,
    'whole-foods': 1.49,
    'trader-joes': 0.89,
  },
}

/**
 * Sample ingredient with variations for testing fuzzy matching
 */
export const mockIngredientVariations = {
  chicken: [
    'chicken breast',
    'chicken thigh',
    'chicken drumstick',
    'ground chicken',
    'diced chicken',
    'shredded chicken',
    'cooked chicken',
  ],
  salt: ['salt', 'kosher salt', 'sea salt', 'table salt', 'himalayan salt'],
  flour: [
    'all-purpose flour',
    'whole wheat flour',
    'bread flour',
    'cake flour',
    'self-rising flour',
  ],
}
