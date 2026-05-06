/**
 * Price sanity checks for scraped grocery prices.
 *
 * The SQL ingest function (fn_bulk_insert_ingredient_history) only rejects
 * prices <= 0 or > $100. These TypeScript-layer checks provide an additional
 * defence, particularly for detecting price spikes against a cached reference.
 */

export type PriceSanityResult =
  | { ok: true }
  | { ok: false; reason: string }

/** Maximum factor by which a new price may exceed the reference before we treat it as a spike. */
export const DEFAULT_SPIKE_FACTOR = 3

/** Maximum factor by which a new price may DROP below the reference (catches zeroed-out prices). */
export const DEFAULT_DROP_FACTOR = 0.1

export function checkAbsoluteRange(
  price: number,
  maxAbsolute = 100
): PriceSanityResult {
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: `Price must be a positive finite number, got ${price}` }
  }
  if (price > maxAbsolute) {
    return { ok: false, reason: `Price $${price} exceeds absolute cap of $${maxAbsolute}` }
  }
  return { ok: true }
}

/**
 * Detects a price spike or collapse relative to a reference price (e.g. the
 * most recent cached value for the same product).
 *
 * - A spike is when the new price is more than `spikeFactor` × the reference.
 * - A collapse is when the new price is less than `dropFactor` × the reference.
 *
 * Neither check fires when the reference price is zero/missing — callers
 * should skip this check when no historical price is available.
 */
export function checkPriceSpike(
  newPrice: number,
  referencePrice: number,
  spikeFactor = DEFAULT_SPIKE_FACTOR,
  dropFactor = DEFAULT_DROP_FACTOR
): PriceSanityResult {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { ok: true } // no reference — cannot judge
  }
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, reason: `New price ${newPrice} is not a positive finite number` }
  }

  const ratio = newPrice / referencePrice
  if (ratio > spikeFactor) {
    return {
      ok: false,
      reason: `Price spike: $${newPrice} is ${ratio.toFixed(1)}× the reference $${referencePrice} (limit ${spikeFactor}×)`,
    }
  }
  if (ratio < dropFactor) {
    return {
      ok: false,
      reason: `Price collapse: $${newPrice} is ${(ratio * 100).toFixed(0)}% of the reference $${referencePrice} (floor ${dropFactor * 100}%)`,
    }
  }
  return { ok: true }
}

/**
 * Combined validation: absolute range + optional spike check.
 *
 * @param newPrice       - The freshly scraped price.
 * @param referencePrice - Most recent cached price for the same product (optional).
 * @param maxAbsolute    - Hard upper cap on package price (default $100, mirrors SQL).
 * @param spikeFactor    - How many times the reference price is allowed (default 3×).
 */
export function validateScrapedPrice(
  newPrice: number,
  options: {
    referencePrice?: number | null
    maxAbsolute?: number
    spikeFactor?: number
  } = {}
): PriceSanityResult {
  const { referencePrice, maxAbsolute = 100, spikeFactor = DEFAULT_SPIKE_FACTOR } = options

  const rangeCheck = checkAbsoluteRange(newPrice, maxAbsolute)
  if (!rangeCheck.ok) return rangeCheck

  if (referencePrice != null && referencePrice > 0) {
    const spikeCheck = checkPriceSpike(newPrice, referencePrice, spikeFactor)
    if (!spikeCheck.ok) return spikeCheck
  }

  return { ok: true }
}
