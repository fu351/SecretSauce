import type { StoreComparison } from "@/lib/types/store"
import { StoreBasketPricer } from "./store-basket-pricer"

export { StoreBasketPricer } from "./store-basket-pricer"

export function buildQuantityMap(
  items: Array<{ id: string; quantity?: number | null }>
): Map<string, number> {
  return StoreBasketPricer.buildQuantityMap(items)
}

export function calculateStoreComparisonTotals(
  storeComparisons: StoreComparison[],
  quantityByItemId: Map<string, number>
): StoreComparison[] {
  return new StoreBasketPricer(quantityByItemId).computeTotals(storeComparisons)
}
