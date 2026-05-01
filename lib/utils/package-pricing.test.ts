import { describe, it, expect } from "vitest"
import {
  hasPackagePricing,
  calcPackages,
  calcLineTotal,
  incrementPackageQty,
  decrementPackageQty,
} from "./package-pricing"

describe("hasPackagePricing", () => {
  it("returns true when all values are valid", () => {
    expect(hasPackagePricing(3.50, 10)).toBe(true)
  })
  it("returns false when packagePrice is null", () => {
    expect(hasPackagePricing(null, 10)).toBe(false)
  })
  it("returns false when packagePrice is 0", () => {
    expect(hasPackagePricing(0, 10)).toBe(false)
  })
  it("returns false when convertedQty is 0", () => {
    expect(hasPackagePricing(3.50, 0)).toBe(false)
  })
  it("returns false when conversionError is true", () => {
    expect(hasPackagePricing(3.50, 10, true)).toBe(false)
  })
  it("returns false when packagePrice is undefined", () => {
    expect(hasPackagePricing(undefined, 10)).toBe(false)
  })
})

describe("calcPackages", () => {
  it("1 bag covers 2 cups when bag = 10 cups", () => {
    expect(calcPackages(2, 10)).toBe(1)
  })
  it("2 bags when qty just exceeds 1 bag", () => {
    expect(calcPackages(11, 10)).toBe(2)
  })
  it("exactly 1 bag when qty equals convertedQty", () => {
    expect(calcPackages(10, 10)).toBe(1)
  })
  it("minimum is always 1 package", () => {
    expect(calcPackages(0.001, 10)).toBe(1)
  })
  it("handles sub-1 convertedQty (each package covers 0.5 units)", () => {
    // need 1 unit, each package = 0.5 units → 2 packages
    expect(calcPackages(1, 0.5)).toBe(2)
  })
  it("handles fractional qty (0.5 cups, 16 cups/bag → 1 bag)", () => {
    expect(calcPackages(0.5, 16)).toBe(1)
  })
  it("3 bags for 25 cups when bag = 10 cups", () => {
    expect(calcPackages(25, 10)).toBe(3)
  })
})

describe("calcLineTotal", () => {
  it("correct total: 2 cups, $3.50/bag, 10 cups/bag → $3.50 (1 bag)", () => {
    expect(calcLineTotal({ qty: 2, packagePrice: 3.50, convertedQty: 10 })).toBe(3.50)
  })
  it("correct total: 11 cups, $3.50/bag, 10 cups/bag → $7.00 (2 bags)", () => {
    expect(calcLineTotal({ qty: 11, packagePrice: 3.50, convertedQty: 10 })).toBe(7.00)
  })
  it("correct total: 10 cups exactly, $3.50/bag, 10 cups/bag → $3.50", () => {
    expect(calcLineTotal({ qty: 10, packagePrice: 3.50, convertedQty: 10 })).toBe(3.50)
  })
  it("returns null when packagePrice is null", () => {
    expect(calcLineTotal({ qty: 2, packagePrice: null, convertedQty: 10 })).toBeNull()
  })
  it("returns null when conversionError is true", () => {
    expect(calcLineTotal({ qty: 2, packagePrice: 3.50, convertedQty: 10, conversionError: true })).toBeNull()
  })
  it("returns null when convertedQty is 0", () => {
    expect(calcLineTotal({ qty: 2, packagePrice: 3.50, convertedQty: 0 })).toBeNull()
  })
  it("returns null when packagePrice is undefined", () => {
    expect(calcLineTotal({ qty: 2, packagePrice: undefined, convertedQty: 10 })).toBeNull()
  })

  // KEY SCENARIO: cheaper per-unit package is NOT always cheaper total
  it("5-cup bag at $2 is cheaper than 10-cup bag at $3.50 when only 3 cups needed", () => {
    const smallBag = calcLineTotal({ qty: 3, packagePrice: 2.00, convertedQty: 5 })
    const largeBag = calcLineTotal({ qty: 3, packagePrice: 3.50, convertedQty: 10 })
    // unit prices: $0.40/cup vs $0.35/cup — large bag is cheaper per cup
    // but total cost: $2.00 vs $3.50 — small bag is cheaper for 3 cups
    expect(smallBag).toBe(2.00)
    expect(largeBag).toBe(3.50)
    expect(smallBag!).toBeLessThan(largeBag!)
  })

  it("10-cup bag at $3.50 is cheaper than 5-cup bag at $2 when 8 cups needed", () => {
    const smallBag = calcLineTotal({ qty: 8, packagePrice: 2.00, convertedQty: 5 })
    const largeBag = calcLineTotal({ qty: 8, packagePrice: 3.50, convertedQty: 10 })
    // small bag: ceil(8/5)=2 bags × $2 = $4.00
    // large bag: ceil(8/10)=1 bag × $3.50 = $3.50
    expect(smallBag).toBe(4.00)
    expect(largeBag).toBe(3.50)
    expect(largeBag!).toBeLessThan(smallBag!)
  })
})

describe("incrementPackageQty", () => {
  it("1 pkg (2 cups) → 2 pkgs (20 cups) when pkg = 10 cups", () => {
    expect(incrementPackageQty(2, 10)).toBe(20)
  })
  it("2 pkgs (20 cups) → 3 pkgs (30 cups) when pkg = 10 cups", () => {
    expect(incrementPackageQty(20, 10)).toBe(30)
  })
  it("increments from exact boundary (10 cups = 1 pkg) → 2 pkgs (20 cups)", () => {
    expect(incrementPackageQty(10, 10)).toBe(20)
  })
  it("handles sub-1 convertedQty: 1 pkg (0.5 units) → 2 pkgs (1 unit)", () => {
    expect(incrementPackageQty(0.5, 0.5)).toBe(1)
  })
})

describe("decrementPackageQty", () => {
  it("cannot go below 1 package: 2 cups (1 pkg) → floor at 10 cups (1 pkg)", () => {
    // You need 2 cups but package is 10 cups. Decrement just keeps you at 1 pkg.
    expect(decrementPackageQty(2, 10)).toBe(10)
  })
  it("2 pkgs (20 cups) → 1 pkg (10 cups)", () => {
    expect(decrementPackageQty(20, 10)).toBe(10)
  })
  it("3 pkgs (30 cups) → 2 pkgs (20 cups)", () => {
    expect(decrementPackageQty(30, 10)).toBe(20)
  })
  it("floor at exactly convertedQty when at 1 package", () => {
    expect(decrementPackageQty(10, 10)).toBe(10)
  })
  it("sub-1 convertedQty: 2 pkgs (1 unit) → 1 pkg (0.5 units)", () => {
    expect(decrementPackageQty(1, 0.5)).toBe(0.5)
  })

  // KEY: ratchet bug — was previously blocked from going below initial qty
  it("allows decrement when currentQty < convertedQty (was ratchet-locked before)", () => {
    // 1 cup needed, package = 10 cups → 1 pkg → decrement still floors at 1 pkg = 10 cups
    // Previously this was Math.max(1, quantity-1) which gave qty=0 or stayed at 1
    const result = decrementPackageQty(1, 10)
    expect(result).toBe(10) // 1 package = 10 cups (the floor)
    expect(result).toBeGreaterThan(0)
  })
})
