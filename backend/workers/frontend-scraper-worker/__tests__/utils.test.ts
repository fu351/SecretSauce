import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  buildFrontendScraperRequestUrl,
  DEFAULT_FRONTEND_SCRAPER_FORCE_REFRESH_TIMEOUT_MS,
  DEFAULT_FRONTEND_SCRAPER_TIMEOUT_MS,
  normalizeFrontendScraperItem,
  resolveFrontendScraperMaxResults,
  resolveFrontendScraperTimeoutMs,
  sortStoreResultsByTotal,
} from "../utils"

describe("frontend scraper utils", () => {
  const previousNextPublic = process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS
  const previousServerMax = process.env.SCRAPER_MAX_RESULTS

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS
    delete process.env.SCRAPER_MAX_RESULTS
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS = previousNextPublic
    process.env.SCRAPER_MAX_RESULTS = previousServerMax
  })

  it("builds request URL with optional query params", () => {
    const url = buildFrontendScraperRequestUrl({
      searchTerm: "olive oil",
      zipCode: "94103-1234",
      store: "Whole Foods",
      forceRefresh: true,
      standardizedIngredientId: "std-123",
    })

    expect(url).toBe(
      "/api/grocery-search?searchTerm=olive%20oil&zipCode=94103&store=Whole%20Foods&forceRefresh=true&liveActivation=true&standardizedIngredientId=std-123"
    )
  })

  it("resolves timeout defaults and override", () => {
    expect(resolveFrontendScraperTimeoutMs(false)).toBe(DEFAULT_FRONTEND_SCRAPER_TIMEOUT_MS)
    expect(resolveFrontendScraperTimeoutMs(true)).toBe(DEFAULT_FRONTEND_SCRAPER_FORCE_REFRESH_TIMEOUT_MS)
    expect(resolveFrontendScraperTimeoutMs(true, 12_500)).toBe(12_500)
  })

  it("resolves max results from override and env fallbacks", () => {
    expect(resolveFrontendScraperMaxResults(2.8)).toBe(2)

    process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS = "7"
    expect(resolveFrontendScraperMaxResults()).toBe(7)

    delete process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS
    process.env.SCRAPER_MAX_RESULTS = "4"
    expect(resolveFrontendScraperMaxResults()).toBe(4)

    delete process.env.SCRAPER_MAX_RESULTS
    expect(resolveFrontendScraperMaxResults()).toBe(0)
  })

  it("normalizes frontend scraper items with stable fallback values", () => {
    const normalized = normalizeFrontendScraperItem({
      provider: "Target",
      name: "Organic Tomato",
      price: "2.25",
      image_url: "",
      rawUnit: "12 oz",
      category: "Produce",
    })

    expect(normalized).toMatchObject({
      id: "target-organic-tomato",
      title: "Organic Tomato",
      brand: "",
      price: 2.25,
      image_url: "/placeholder.svg",
      provider: "Target",
      rawUnit: "12 oz",
      category: "Produce",
    })
  })

  it("preserves explicit raw_unit over weaker unit hints", () => {
    const normalized = normalizeFrontendScraperItem({
      provider: "Target",
      title: "Sparkling Water",
      price: "1.99",
      raw_unit: " 12 fl oz ",
      unit: "16 oz",
      size: "20 oz",
      pricePerUnit: "$0.15/oz",
    })

    expect(normalized).toMatchObject({
      title: "Sparkling Water",
      rawUnit: "12 fl oz",
    })
  })

  it("falls back to extracted unit hints when rawUnit is absent", () => {
    const normalized = normalizeFrontendScraperItem({
      provider: "Target",
      title: "Olive Oil",
      price: "9.99",
      price_per_unit: "$0.31/fl oz",
    })

    expect(normalized).toMatchObject({
      rawUnit: "fl oz",
    })
  })

  it("sorts store results by total ascending", () => {
    const sorted = sortStoreResultsByTotal([
      { store: "B", items: [], total: 20 },
      { store: "A", items: [], total: 10 },
    ])

    expect(sorted.map((row) => row.store)).toEqual(["A", "B"])
  })
})
