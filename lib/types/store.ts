

export interface GroceryItem {
  id: string
  title: string
  brand: string
  price: number
  pricePerUnit?: string
  unit?: string
  image_url: string
  provider: string
  location?: string
  category?: string
  quantity?: number;
}

export interface ShoppingListItem {
  id: string
  name: string
  quantity: number
  unit: string
  checked: boolean
  recipeId?: string
  recipeName?: string
  ingredientId?: string
  standardizedName?: string
  // Indicates if this item comes from a recipe (recipe_shopping_items) or is user-added (miscellaneous_shopping_items)
  source: 'recipe' | 'miscellaneous'
  // Only for recipe items - mask array to hide specific ingredients
  ingredientMask?: boolean[]
  // Only for recipe items - mask array to track which ingredients are checked off
  checkedMask?: boolean[]
  // Only for recipe items - number of servings
  servings?: number
  // Only for recipe items - per-serving amounts for scaling
  amountsPerServing?: number[]
  // Price per unit for the item
  price?: number
  // Name of the store where the price was found
  storeName?: string
}

export interface Recipe {
  id: string
  title: string
  ingredients: any[]
}

export interface StoreComparison {
  store: string
  items: (GroceryItem & { shoppingItemId: string; originalName: string })[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  missingItems?: boolean
  missingCount?: number
  providerAliases?: string[]
  canonicalKey?: string
  missingIngredients?: ShoppingListItem[]
}

export type PantryItemInfo = {
  id: string
  quantity: number
  unit: string | null
  standardized_ingredient_id?: string | null
  standardized_name?: string | null
}

export interface ShoppingListSectionProps {
  shoppingList: ShoppingListItem[]
  onRemoveItem: (itemId: string) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onUpdateItemName: (itemId: string, newName: string) => void
  onToggleItem: (itemId: string) => void
  headerAction?: React.ReactNode
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  buttonOutlineClass: string
  theme: string
}