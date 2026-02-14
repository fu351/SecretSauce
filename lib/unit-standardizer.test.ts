import { describe, expect, it } from "vitest"
import {
  normalizeUnitLabel,
  parseUnitStandardizationPayload,
  type UnitStandardizationInput,
} from "./unit-standardizer"

describe("unit standardizer parser", () => {
  it("normalizes common aliases to canonical enum values", () => {
    expect(normalizeUnitLabel("lbs")).toBe("lb")
    expect(normalizeUnitLabel("g")).toBe("gram")
    expect(normalizeUnitLabel("fl. oz")).toBe("fl oz")
  })

  it("parses valid response entries", () => {
    const inputs: UnitStandardizationInput[] = [
      {
        id: "row-1",
        rawProductName: "Flour 5 lb",
        cleanedName: "flour",
        rawUnit: "5 lb",
        source: "scraper",
      },
    ]

    const parsed = parseUnitStandardizationPayload(inputs, [
      {
        id: "row-1",
        resolvedUnit: "lb",
        resolvedQuantity: 5,
        confidence: 0.91,
        status: "success",
      },
    ])

    expect(parsed[0]).toMatchObject({
      id: "row-1",
      resolvedUnit: "lb",
      resolvedQuantity: 5,
      confidence: 0.91,
      status: "success",
    })
  })

  it("returns deterministic errors for invalid payload entries", () => {
    const inputs: UnitStandardizationInput[] = [
      {
        id: "row-2",
        rawProductName: "Soda Pack",
        cleanedName: "soda",
        rawUnit: "pack",
        source: "scraper",
      },
    ]

    const parsed = parseUnitStandardizationPayload(inputs, [
      {
        id: "row-2",
        resolvedUnit: "pack",
        resolvedQuantity: 0,
        confidence: 0.8,
        status: "success",
      },
    ])

    expect(parsed[0]?.status).toBe("error")
    expect(parsed[0]?.error).toContain("Resolved unit")
  })

  it("accepts explicit unit signals attached to numbers in raw product name", () => {
    const inputs: UnitStandardizationInput[] = [
      {
        id: "row-3",
        rawProductName: "Italian Roast Espresso 12oz",
        cleanedName: "italian roast espresso",
        rawUnit: "",
        source: "scraper",
      },
    ]

    const parsed = parseUnitStandardizationPayload(inputs, [
      {
        id: "row-3",
        resolvedUnit: "oz",
        resolvedQuantity: 12,
        confidence: 0.92,
        status: "success",
      },
    ])

    expect(parsed[0]).toMatchObject({
      id: "row-3",
      resolvedUnit: "oz",
      resolvedQuantity: 12,
      status: "success",
    })
  })

  it("rejects unit resolutions when raw product name/unit fields have no explicit unit signal", () => {
    const inputs: UnitStandardizationInput[] = [
      {
        id: "row-4",
        rawProductName: "Italian roast ground espresso",
        cleanedName: "ground espresso",
        rawUnit: "",
        source: "scraper",
      },
    ]

    const parsed = parseUnitStandardizationPayload(inputs, [
      {
        id: "row-4",
        resolvedUnit: "oz",
        resolvedQuantity: 1,
        confidence: 0.8,
        status: "success",
      },
    ])

    expect(parsed[0]?.status).toBe("error")
    expect(parsed[0]?.error).toContain("No explicit unit found")
  })

  it("rejects units not supported by raw unit/product name evidence", () => {
    const inputs: UnitStandardizationInput[] = [
      {
        id: "row-5",
        rawProductName: "Soda 12 fl oz can",
        cleanedName: "soda",
        rawUnit: "",
        source: "scraper",
      },
    ]

    const parsed = parseUnitStandardizationPayload(inputs, [
      {
        id: "row-5",
        resolvedUnit: "lb",
        resolvedQuantity: 1,
        confidence: 0.9,
        status: "success",
      },
    ])

    expect(parsed[0]?.status).toBe("error")
    expect(parsed[0]?.error).toContain("not supported")
  })
})
