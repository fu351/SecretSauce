import { describe, expect, it } from "vitest"
import { normalizeScraperResult, normalizeScraperResults } from "../types"

describe("scraper result normalization", () => {
  it("normalizes legacy fields and appends unit hints to product name", () => {
    const normalized = normalizeScraperResult({
      id: 123,
      title: "Organic Milk",
      price: "5.49",
      pricePerUnit: "$0.34 / oz",
    })

    expect(normalized).toMatchObject({
      product_name: "Organic Milk oz",
      price: 5.49,
      product_id: "123",
      rawUnit: "oz",
      unit: "oz",
    })
  })

  it("does not duplicate unit text already embedded in name", () => {
    const normalized = normalizeScraperResult({
      product_name: "Greek Yogurt 32 oz",
      price: 6,
      unit: "oz",
    })

    expect(normalized.product_name).toBe("Greek Yogurt 32 oz")
  })

  it("filters invalid or empty entries from arrays", () => {
    const normalized = normalizeScraperResults([
      { title: "Eggs", price: 3.99 },
      { title: "", price: 4.99 },
      { title: "Broken", price: 0 },
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]?.product_name).toBe("Eggs")
  })
})
