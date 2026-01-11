import { useMemo } from "react"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of item names
 */
function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length
  const bLen = b.length

  if (aLen === 0) return bLen
  if (bLen === 0) return aLen

  const matrix: number[][] = Array(aLen + 1)
    .fill(null)
    .map(() => Array(bLen + 1).fill(0))

  for (let i = 0; i <= aLen; i++) matrix[i][0] = i
  for (let j = 0; j <= bLen; j++) matrix[0][j] = j

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[aLen][bLen]
}

/**
 * Calculate fuzzy match similarity (0-1, where 1 is exact match)
 * Considers both Levenshtein distance and string length
 */
function getFuzzyMatchScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b)
  const maxLength = Math.max(a.length, b.length)
  return 1 - distance / maxLength
}

/**
 * Hook to manage merging of shopping list items by name using fuzzy matching
 * Used in ungrouped view to combine similar items from different sources
 */
export function useMergedItems(uniqueList: ShoppingListItem[], isGrouped: boolean) {
  return useMemo(() => {
    if (isGrouped) return []

    const FUZZY_THRESHOLD = 0.85 // 85% similarity threshold
    const mergeMap = new Map<string, ShoppingListItem & { itemsWithSameName: ShoppingListItem[] }>()
    const processedIndices = new Set<number>()

    uniqueList.forEach((item, index) => {
      if (processedIndices.has(index)) return

      const itemName = item.name.toLowerCase().trim()
      let mergeKey: string | null = null
      let bestMatch: string | null = null
      let bestScore = FUZZY_THRESHOLD

      // Look for existing fuzzy matches
      for (const [existingKey, mergedItem] of mergeMap.entries()) {
        const score = getFuzzyMatchScore(itemName, mergedItem.name.toLowerCase().trim())
        if (score > bestScore) {
          bestScore = score
          bestMatch = existingKey
        }
      }

      // Also check if this item fuzzy matches any unprocessed items
      if (!bestMatch) {
        for (let j = index + 1; j < uniqueList.length; j++) {
          if (processedIndices.has(j)) continue

          const otherName = uniqueList[j].name.toLowerCase().trim()
          const score = getFuzzyMatchScore(itemName, otherName)
          if (score > bestScore) {
            bestScore = score
            mergeKey = otherName
          }
        }
      }

      if (bestMatch) {
        // Add to existing fuzzy match group
        const existing = mergeMap.get(bestMatch)!
        existing.quantity += item.quantity
        existing.itemsWithSameName.push(item)
        processedIndices.add(index)
      } else if (mergeKey) {
        // Create new group with fuzzy matched items
        const groupItems: ShoppingListItem[] = [item]
        processedIndices.add(index)

        // Find all items that match this one fuzzily
        for (let j = index + 1; j < uniqueList.length; j++) {
          if (processedIndices.has(j)) continue

          const otherName = uniqueList[j].name.toLowerCase().trim()
          const score = getFuzzyMatchScore(itemName, otherName)
          if (score > FUZZY_THRESHOLD) {
            groupItems.push(uniqueList[j])
            processedIndices.add(j)
          }
        }

        const merged = {
          ...item,
          quantity: groupItems.reduce((sum, i) => sum + i.quantity, 0),
          itemsWithSameName: groupItems,
        }
        mergeMap.set(mergeKey, merged)
      } else {
        // No fuzzy match found, create single item group
        mergeMap.set(itemName, { ...item, itemsWithSameName: [item] })
        processedIndices.add(index)
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
