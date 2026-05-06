import type { StoreComparison } from "@/lib/types/store"
import { PricingStrategy } from "@/lib/utils/pricing-strategy"
import { validateEffectiveQuantity } from "./quantity-sanity"

type StoreItem = StoreComparison["items"][number]

/**
 * Encapsulates all basket-level pricing logic for a snapshot of the user's
 * shopping list quantities.
 *
 * Construct once per render from the current shopping list, then call
 * `getItemLineTotal`, `computeTotals`, etc. as needed.
 *
 * @example
 * const pricer = StoreBasketPricer.fromShoppingList(shoppingList)
 * const totals = pricer.computeTotals(storeComparisons)
 */
export class StoreBasketPricer {
  private readonly quantityByItemId: Map<string, number>

  constructor(quantityByItemId: Map<string, number>) {
    this.quantityByItemId = quantityByItemId
  }

  static buildQuantityMap(
    items: Array<{ id: string; quantity?: number | null }>
  ): Map<string, number> {
    return new Map(
      items.map((item) => [item.id, Math.max(1, Number(item.quantity) || 1)])
    )
  }

  static fromShoppingList(
    items: Array<{ id: string; quantity?: number | null }>
  ): StoreBasketPricer {
    return new StoreBasketPricer(StoreBasketPricer.buildQuantityMap(items))
  }

  getQuantityMap(): Map<string, number> {
    return this.quantityByItemId
  }

  /**
   * Resolves the total ingredient quantity currently in the shopping list for
   * this store item (which may span multiple shopping list item IDs from the
   * same ingredient used in several recipes).
   */
  getEffectiveQuantity(item: StoreItem): number {
    const ids = item.shoppingItemIds?.filter(Boolean) ?? [item.shoppingItemId]
    let qty = 0
    for (const id of ids) {
      qty += this.quantityByItemId.get(id) ?? 0
    }
    const effectiveQty = qty > 0 ? qty : Math.max(1, Number(item.quantity) || 1)
    const sanity = validateEffectiveQuantity(effectiveQty, { baselineQty: item.quantity })
    if (!sanity.ok) {
      console.warn("[StoreBasketPricer] Quantity sanity check failed", {
        itemId: item.shoppingItemId,
        effectiveQty,
        baselineQty: item.quantity,
        reason: sanity.reason,
      })
    }
    return effectiveQty
  }

  /** Returns the appropriate pricing strategy for this store item, or null. */
  getPricingStrategy(item: StoreItem): PricingStrategy | null {
    return PricingStrategy.create({
      packagePrice: item.packagePrice,
      convertedQty: item.convertedQuantity,
      conversionError: item.conversionError,
      baselineQty: item.quantity,
      baselinePackages: item.packagesToBuy,
    })
  }

  /**
   * Line total for this store item at the current shopping list quantity.
   * Falls back to `price × effectiveQty` when no package pricing is available.
   */
  getItemLineTotal(item: StoreItem): number {
    const qty = this.getEffectiveQuantity(item)
    const strategy = this.getPricingStrategy(item)
    return strategy?.getLineTotal(qty) ?? (Number(item.price) || 0) * qty
  }

  /**
   * Recomputes `total` and `savings` fields for every store in the list using
   * the current shopping list quantities. Items arrays are left unchanged.
   */
  computeTotals(storeComparisons: StoreComparison[]): StoreComparison[] {
    if (storeComparisons.length === 0) return storeComparisons

    const withTotals = storeComparisons
      .filter((store) => store.items.length > 0)
      .map((store) => ({
        ...store,
        total: store.items.reduce(
          (sum, item) => sum + this.getItemLineTotal(item),
          0
        ),
      }))

    if (withTotals.length === 0) return []

    const maxTotal = Math.max(...withTotals.map((s) => s.total), 0)
    return withTotals.map((store) => ({
      ...store,
      savings: maxTotal - store.total,
    }))
  }
}
