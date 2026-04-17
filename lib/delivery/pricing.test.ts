import { describe, it, expect } from "vitest"
import { calculateDeliveryFees, getDeliveryFeeRules } from "./pricing"

describe("getDeliveryFeeRules", () => {
  it("returns 6.99 flat fee and 5% basket rate for free tier", () => {
    const rules = getDeliveryFeeRules("free")
    expect(rules.flatFee).toBe(6.99)
    expect(rules.basketFeeRate).toBe(0.05)
  })

  it("returns 4.99 flat fee and 3% basket rate for premium tier", () => {
    const rules = getDeliveryFeeRules("premium")
    expect(rules.flatFee).toBe(4.99)
    expect(rules.basketFeeRate).toBe(0.03)
  })
})

describe("calculateDeliveryFees", () => {
  it("calculates correct fees for free tier", () => {
    const result = calculateDeliveryFees(100, "free")
    expect(result.subtotal).toBe(100)
    expect(result.flatFee).toBe(6.99)
    expect(result.basketFeeRate).toBe(0.05)
    expect(result.basketFeeAmount).toBe(5.00)
    expect(result.totalDeliveryFee).toBe(11.99)
    expect(result.grandTotal).toBe(111.99)
    expect(result.subscriptionTierAtCheckout).toBe("free")
  })

  it("calculates correct fees for premium tier", () => {
    const result = calculateDeliveryFees(100, "premium")
    expect(result.subtotal).toBe(100)
    expect(result.flatFee).toBe(4.99)
    expect(result.basketFeeRate).toBe(0.03)
    expect(result.basketFeeAmount).toBe(3.00)
    expect(result.totalDeliveryFee).toBe(7.99)
    expect(result.grandTotal).toBe(107.99)
    expect(result.subscriptionTierAtCheckout).toBe("premium")
  })

  it("rounds basket fee to two decimal places", () => {
    // $33.33 × 5% = $1.6665 → rounds to $1.67
    const result = calculateDeliveryFees(33.33, "free")
    expect(result.basketFeeAmount).toBe(1.67)
    expect(result.totalDeliveryFee).toBe(8.66)
    expect(result.grandTotal).toBe(41.99)
  })

  it("handles zero subtotal", () => {
    const result = calculateDeliveryFees(0, "free")
    expect(result.basketFeeAmount).toBe(0)
    expect(result.totalDeliveryFee).toBe(6.99)
    expect(result.grandTotal).toBe(6.99)
  })
})
