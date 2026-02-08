import type { ShoppingListIngredient } from './ingredient'

/**
 * Grocery Item Type
 *
 * Represents a single grocery product available at a store.
 * Contains product information, pricing, and provider details.
 */
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
  latitude?: number
  longitude?: number
  category?: string
  quantity?: number
  productMappingId?: string
  packagesToBuy?: number
  requestedUnit?: string | null
  productUnit?: string | null
  productQuantity?: number | null
  convertedQuantity?: number | null
  packagePrice?: number | null
  conversionError?: boolean | null
}

/**
 * Store Comparison Type
 *
 * Comparison of grocery items across stores for a shopping list.
 * Shows total cost, savings, distance, and availability information.
 *
 * Used to help users find the best stores for their shopping list
 * and compare prices across different retailers.
 *
 * @example
 * const storeComparison: StoreComparison = {
 *   store: "Whole Foods",
 *   items: [{...}],
 *   total: 42.99,
 *   savings: 5.50,
 *   distanceMiles: 2.3,
 *   missingCount: 2,
 *   missingIngredients: [{...}]
 * }
 */
export interface StoreComparison {
  store: string
  items: (GroceryItem & {
    shoppingItemId: string
    originalName: string
    shoppingItemIds?: string[]
  })[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  latitude?: number
  longitude?: number
  missingItems?: boolean
  missingCount?: number
  providerAliases?: string[]
  canonicalKey?: string
  groceryStoreId?: string | null
  missingIngredients?: ShoppingListIngredient[]
}

/**
 * Shopping List Section Props Type
 *
 * Props passed to shopping list section components.
 * Includes list data, handlers, and theme customization options.
 */
export interface ShoppingListSectionProps {
  shoppingList: ShoppingListIngredient[]
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
