/**
 * Quantity sanity checks for basket pricing.
 *
 * Catches cases where getEffectiveQuantity returns a value that is
 * unreasonably large relative to the baseline quantity captured at
 * search time (item.quantity / total_amount from the get_pricing RPC).
 *
 * The primary failure mode these checks guard against is the
 * shoppingItemIds double-counting bug, where new recipe additions after
 * a store search inflate effectiveQty beyond what the pricing strategies
 * were calibrated against.
 */

export type QuantitySanityResult =
  | { ok: true }
  | { ok: false; reason: string }

/** effectiveQty may not exceed this multiple of the baseline before we flag inflation. */
export const DEFAULT_QTY_SPIKE_FACTOR = 5

/** Absolute ceiling on any single ingredient quantity used for pricing. */
export const DEFAULT_QTY_MAX = 10_000

export function checkQuantityRange(
  qty: number,
  max = DEFAULT_QTY_MAX
): QuantitySanityResult {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: `Quantity must be a positive finite number, got ${qty}` }
  }
  if (qty > max) {
    return { ok: false, reason: `Quantity ${qty} exceeds absolute cap of ${max}` }
  }
  return { ok: true }
}

/**
 * Detects quantity inflation relative to the baseline captured at search time.
 *
 * - Does NOT fire when baseline is zero/missing — no reference means no comparison.
 * - A ratio above `spikeFactor` suggests the shoppingItemIds set has grown beyond
 *   the snapshot the store search was based on, likely inflating package counts.
 */
export function checkQuantityInflation(
  effectiveQty: number,
  baselineQty: number,
  spikeFactor = DEFAULT_QTY_SPIKE_FACTOR
): QuantitySanityResult {
  if (!Number.isFinite(baselineQty) || baselineQty <= 0) {
    return { ok: true } // no baseline — cannot judge
  }
  if (!Number.isFinite(effectiveQty) || effectiveQty <= 0) {
    return { ok: false, reason: `Effective quantity ${effectiveQty} is not a positive finite number` }
  }

  const ratio = effectiveQty / baselineQty
  if (ratio > spikeFactor) {
    return {
      ok: false,
      reason: `Quantity inflation: effective ${effectiveQty} is ${ratio.toFixed(1)}× the search-time baseline ${baselineQty} (limit ${spikeFactor}×)`,
    }
  }
  return { ok: true }
}

/**
 * Combined validation: absolute range + optional inflation check.
 *
 * @param effectiveQty - The quantity resolved from the current shopping list.
 * @param baselineQty  - The total_amount captured when the store search ran (optional).
 * @param spikeFactor  - How many times the baseline is allowed (default 5×).
 */
export function validateEffectiveQuantity(
  effectiveQty: number,
  options: {
    baselineQty?: number | null
    max?: number
    spikeFactor?: number
  } = {}
): QuantitySanityResult {
  const { baselineQty, max = DEFAULT_QTY_MAX, spikeFactor = DEFAULT_QTY_SPIKE_FACTOR } = options

  const rangeCheck = checkQuantityRange(effectiveQty, max)
  if (!rangeCheck.ok) return rangeCheck

  if (baselineQty != null && baselineQty > 0) {
    const inflationCheck = checkQuantityInflation(effectiveQty, baselineQty, spikeFactor)
    if (!inflationCheck.ok) return inflationCheck
  }

  return { ok: true }
}
