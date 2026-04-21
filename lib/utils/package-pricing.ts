/**
 * Pure calculation functions for package-based grocery pricing.
 *
 * "Packages" = number of physical store units needed to cover a recipe quantity.
 * e.g. need 3 cups of flour; each bag contains 10 cups → buy ceil(3/10) = 1 bag.
 */

export interface PackagePricingInput {
  qty: number
  packagePrice: number | null | undefined
  convertedQty: number | null | undefined
  conversionError?: boolean
}

/** Whether a priced item has valid package pricing (vs. falling back to per-unit). */
export function hasPackagePricing(
  packagePrice: number | null | undefined,
  convertedQty: number | null | undefined,
  conversionError?: boolean
): boolean {
  const pp = Number(packagePrice)
  const cq = Number(convertedQty)
  return Number.isFinite(pp) && pp > 0 && cq > 0 && !conversionError
}

/**
 * Number of packages required to cover `qty` ingredient units.
 * Always at least 1.
 */
export function calcPackages(qty: number, convertedQty: number): number {
  return Math.max(1, Math.ceil(qty / convertedQty))
}

/**
 * Total cost for the packages needed to cover `qty`.
 * Returns null if package pricing data is missing or invalid.
 */
export function calcLineTotal(input: PackagePricingInput): number | null {
  const { qty, packagePrice, convertedQty, conversionError } = input
  if (!hasPackagePricing(packagePrice, convertedQty, conversionError)) return null
  return Number(packagePrice) * calcPackages(qty, Number(convertedQty))
}

/**
 * New ingredient quantity after incrementing by one package.
 * e.g. currently 2 cups (1 bag of 10) → next is 2 bags → 20 cups.
 */
export function incrementPackageQty(currentQty: number, convertedQty: number): number {
  const current = calcPackages(currentQty, convertedQty)
  return Number(((current + 1) * convertedQty).toFixed(4))
}

/**
 * New ingredient quantity after decrementing by one package.
 * Floor is 1 package (= convertedQty units). Cannot go below.
 */
export function decrementPackageQty(currentQty: number, convertedQty: number): number {
  const current = calcPackages(currentQty, convertedQty)
  const next = Math.max(1, current - 1)
  return Math.max(convertedQty, Number((next * convertedQty).toFixed(4)))
}
