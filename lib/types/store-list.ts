import { Ingredient  } from "./recipe-base"

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

// contants

export type ShoppingSourceType = 'recipe' | 'manual'