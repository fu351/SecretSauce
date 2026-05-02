import type { StoreComparison } from "@/lib/types/store"
import { calcLineTotal } from "@/lib/utils/package-pricing"

export function buildQuantityMap(items: Array<{ id: string; quantity?: number | null }>): Map<string, number> {
  return new Map(
    items.map((item) => [
      item.id,
      Math.max(1, Number(item.quantity) || 1),
    ])
  )
}

function getEffectiveStoreItemQuantity(
  item: StoreComparison["items"][number],
  quantityByItemId: Map<string, number>
): number {
  const itemIds = item.shoppingItemIds?.filter(Boolean) || [item.shoppingItemId]
  let effectiveQty = 0

  itemIds.forEach((id) => {
    effectiveQty += quantityByItemId.get(id) ?? 0
  })

  if (effectiveQty <= 0) {
    effectiveQty = Math.max(1, Number(item.quantity) || 1)
  }

  return effectiveQty
}

function getStoreItemLineTotal(
  item: StoreComparison["items"][number],
  quantityByItemId: Map<string, number>
): number {
  const effectiveQty = getEffectiveStoreItemQuantity(item, quantityByItemId)
  const lineTotal = calcLineTotal({
    qty: effectiveQty,
    packagePrice: item.packagePrice,
    convertedQty: item.convertedQuantity,
    conversionError: item.conversionError ?? undefined,
  })

  return lineTotal ?? (Number(item.price) || 0) * effectiveQty
}

export function calculateStoreComparisonTotals(
  storeComparisons: StoreComparison[],
  quantityByItemId: Map<string, number>
): StoreComparison[] {
  if (storeComparisons.length === 0) return storeComparisons

  const updatedComparisons = storeComparisons.map((store) => {
    const total = store.items.reduce((sum, item) => sum + getStoreItemLineTotal(item, quantityByItemId), 0)
    return {
      ...store,
      total,
    }
  })

  const maxTotal = Math.max(...updatedComparisons.map((store) => store.total), 0)
  return updatedComparisons.map((store) => ({
    ...store,
    savings: maxTotal - store.total,
  }))
}
