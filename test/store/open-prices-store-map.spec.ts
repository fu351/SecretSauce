import { describe, expect, it } from "vitest"
import {
  normalizeStoreName,
  resolveOpenPricesLocationStore,
  resolveParentGroceryStoreEnum,
} from "@/lib/store/open-prices-store-map"

describe("Open Prices store mapping", () => {
  it("normalizes store names to the existing compact key format", () => {
    expect(normalizeStoreName("Trader Joe's")).toBe("traderjoes")
    expect(normalizeStoreName("Smart & Final extra!")).toBe("smartandfinalextra")
  })

  it("maps Kroger subsidiaries to kroger", () => {
    expect(resolveParentGroceryStoreEnum("Fred Meyer")).toBe("kroger")
    expect(resolveParentGroceryStoreEnum("QFC")).toBe("kroger")
    expect(resolveParentGroceryStoreEnum("Fry's Marketplace")).toBe("kroger")
    expect(resolveParentGroceryStoreEnum("Harris Teeter")).toBe("kroger")
  })

  it("maps other US banners to parent store enums", () => {
    expect(resolveParentGroceryStoreEnum("Vons")).toBe("albertsons")
    expect(resolveParentGroceryStoreEnum("Nob Hill Foods")).toBe("raleys")
    expect(resolveParentGroceryStoreEnum("FoodMaxx")).toBe("savemart")
    expect(resolveParentGroceryStoreEnum("Giant Food")).toBe("aholddelhaize")
  })

  it("prefers brand over location name for Open Prices locations", () => {
    expect(
      resolveOpenPricesLocationStore({
        osm_brand: "Walmart",
        osm_name: "Walmart Neighborhood Market",
      })
    ).toBe("walmart")
  })

  it("does not import obvious non-grocery locations", () => {
    expect(resolveParentGroceryStoreEnum("Ace Hardware")).toBeNull()
    expect(resolveParentGroceryStoreEnum("Northport High School")).toBeNull()
  })
})
