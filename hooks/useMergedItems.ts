import { useMemo } from "react"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Hook to manage merging of shopping list items by name
 * Used in ungrouped view to combine items with the same name from different sources
 */
export function useMergedItems(uniqueList: ShoppingListItem[], isGrouped: boolean) {
  return useMemo(() => {
    if (isGrouped) return []

    const mergeMap = new Map<string, ShoppingListItem & { itemsWithSameName: ShoppingListItem[] }>()

    uniqueList.forEach((item) => {
      // Merge all items with the same name, regardless of source
      const key = item.name.toLowerCase()

      if (mergeMap.has(key)) {
        const existing = mergeMap.get(key)!
        // Merge quantities
        existing.quantity += item.quantity
        // Merge checked state (only checked if all instances are checked)
        existing.checked = existing.checked && item.checked
        // Track all items with the same name for price and quantity handling
        existing.itemsWithSameName.push(item)
      } else {
        // Store a copy to avoid mutating original
        mergeMap.set(key, { ...item, itemsWithSameName: [item] })
      }
    })

    return Array.from(mergeMap.values()).map((item) => {
      const { itemsWithSameName, ...rest } = item
      return { ...rest, itemsWithSameName }
    })
  }, [uniqueList, isGrouped])
}

/**
 * Helper function to distribute quantity changes across merged items
 * Prioritizes miscellaneous items first, then recipe items
 */
export function distributeQuantityChange(
  mergedItem: ShoppingListItem & { itemsWithSameName?: ShoppingListItem[] },
  newTotalQuantity: number,
  onUpdateQuantity: (id: string, quantity: number) => void
) {
  if (!mergedItem.itemsWithSameName || mergedItem.itemsWithSameName.length <= 1) {
    // Single item or no merged items - just update directly
    onUpdateQuantity(mergedItem.id, newTotalQuantity)
    return
  }

  const allItems = mergedItem.itemsWithSameName
  const miscItems = allItems.filter((item) => item.source === "miscellaneous")
  const recipeItems = allItems.filter((item) => item.source !== "miscellaneous")

  const oldTotal = allItems.reduce((sum, item) => sum + item.quantity, 0)
  const quantityChange = newTotalQuantity - oldTotal

  if (quantityChange > 0) {
    // INCREASING: Add to miscellaneous items first
    if (miscItems.length > 0) {
      const increasePerItem = quantityChange / miscItems.length
      miscItems.forEach((item) => {
        const newQuantity = Math.round((item.quantity + increasePerItem) * 10) / 10
        onUpdateQuantity(item.id, newQuantity)
      })
    } else {
      // No misc items, distribute across recipe items
      const increasePerItem = quantityChange / recipeItems.length
      recipeItems.forEach((item) => {
        const newQuantity = Math.round((item.quantity + increasePerItem) * 10) / 10
        onUpdateQuantity(item.id, newQuantity)
      })
    }
  } else if (quantityChange < 0) {
    // DECREASING: Remove from miscellaneous items first
    let remainingDecrease = Math.abs(quantityChange)

    // First, decrease from miscellaneous items
    for (const item of miscItems) {
      if (remainingDecrease <= 0) break

      const canDecrease = item.quantity - 1 // Keep at least 1
      const actualDecrease = Math.min(canDecrease, remainingDecrease)

      if (actualDecrease > 0) {
        const newQuantity = Math.max(1, Math.round((item.quantity - actualDecrease) * 10) / 10)
        onUpdateQuantity(item.id, newQuantity)
        remainingDecrease -= actualDecrease
      }
    }

    // If still need to decrease, decrease from recipe items
    if (remainingDecrease > 0) {
      for (const item of recipeItems) {
        if (remainingDecrease <= 0) break

        const canDecrease = item.quantity - 1
        const actualDecrease = Math.min(canDecrease, remainingDecrease)

        if (actualDecrease > 0) {
          const newQuantity = Math.max(1, Math.round((item.quantity - actualDecrease) * 10) / 10)
          onUpdateQuantity(item.id, newQuantity)
          remainingDecrease -= actualDecrease
        }
      }
    }
  }
}
