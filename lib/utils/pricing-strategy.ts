/**
 * Strategy pattern for grocery package-based pricing.
 *
 * Use `PricingStrategy.create(data)` to get the right strategy for an item.
 * Call `strategy.getPackageCount(qty)` / `strategy.getLineTotal(qty)` /
 * `strategy.getIncrementedQty(qty)` / `strategy.getDecrementedQty(qty)`.
 *
 * Concrete strategies are not exported — callers work through the base class.
 */

export interface PricingData {
  packagePrice: number | null | undefined
  convertedQty: number | null | undefined
  conversionError?: boolean | null
  baselineQty?: number | null | undefined
  baselinePackages?: number | null | undefined
}

export abstract class PricingStrategy {
  protected readonly packagePrice: number

  protected constructor(packagePrice: number) {
    this.packagePrice = packagePrice
  }

  /** Whole packages needed to cover `qty` ingredient units. Always ≥ 1. */
  abstract getPackageCount(qty: number): number

  /** Total cost for the packages needed to cover `qty`. */
  getLineTotal(qty: number): number {
    return this.packagePrice * this.getPackageCount(qty)
  }

  /** Ingredient quantity that corresponds to `packages` whole packages. */
  protected pkgsToQty(packages: number): number {
    return packages
  }

  /** New ingredient quantity after stepping up by one package. */
  getIncrementedQty(currentQty: number): number {
    return this.pkgsToQty(this.getPackageCount(currentQty) + 1)
  }

  /** New ingredient quantity after stepping down by one package (floor: 1 pkg). */
  getDecrementedQty(currentQty: number): number {
    const next = Math.max(1, this.getPackageCount(currentQty) - 1)
    return Math.max(this.pkgsToQty(1), this.pkgsToQty(next))
  }

  /**
   * Factory: returns the best-fit strategy for `data`, or `null` if the
   * package price is missing / invalid (caller should fall back to unit price).
   *
   * Priority:
   *   1. ConversionPricingStrategy  — convertedQty available, no conversionError
   *   2. EstimatePricingStrategy    — conversionError but baselineQty/Packages known
   *   3. SinglePackagePricingStrategy — price is fixed regardless of qty
   */
  static create(data: PricingData): PricingStrategy | null {
    const pp = Number(data.packagePrice)
    if (!Number.isFinite(pp) || pp <= 0) return null

    if (!data.conversionError) {
      const cq = Number(data.convertedQty)
      if (Number.isFinite(cq) && cq > 0) {
        return new ConversionPricingStrategy(pp, cq)
      }
    }

    const bq = Number(data.baselineQty)
    const bp = Number(data.baselinePackages)
    if (Number.isFinite(bq) && bq > 0 && Number.isFinite(bp) && bp > 0) {
      return new EstimatePricingStrategy(pp, bq, bp)
    }

    return new SinglePackagePricingStrategy(pp)
  }
}

/**
 * Used when the product's unit can be directly converted to the recipe unit
 * (e.g. "need 3 cups; bag contains 10 cups → buy 1 bag").
 */
class ConversionPricingStrategy extends PricingStrategy {
  private readonly convertedQty: number

  constructor(packagePrice: number, convertedQty: number) {
    super(packagePrice)
    this.convertedQty = convertedQty
  }

  getPackageCount(qty: number): number {
    return Math.max(1, Math.ceil(qty / this.convertedQty))
  }

  protected pkgsToQty(packages: number): number {
    return Number((packages * this.convertedQty).toFixed(4))
  }
}

/**
 * Used when the unit conversion failed but we know how many packages the
 * baseline quantity required (e.g. "DB said 1 pkg for 2 units → scale up").
 */
class EstimatePricingStrategy extends PricingStrategy {
  private readonly packageSize: number

  constructor(packagePrice: number, baselineQty: number, baselinePackages: number) {
    super(packagePrice)
    this.packageSize = baselineQty / baselinePackages
  }

  getPackageCount(qty: number): number {
    return Math.max(1, Math.ceil(qty / this.packageSize))
  }

  protected pkgsToQty(packages: number): number {
    return Number((packages * this.packageSize).toFixed(4))
  }
}

/**
 * Used when we have a valid package price but no way to scale it with
 * quantity (always 1 package regardless of how much the user requests).
 */
class SinglePackagePricingStrategy extends PricingStrategy {
  getPackageCount(_qty: number): number {
    return 1
  }
}
