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
})
