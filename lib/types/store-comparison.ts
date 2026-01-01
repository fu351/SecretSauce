import { ShoppingListItem } from './store-list'

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
  quantity?: number
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