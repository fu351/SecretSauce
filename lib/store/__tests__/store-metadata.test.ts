import { describe, it, expect, vi } from "vitest"
import { buildStoreMetadataFromRows, buildStoreMetadataFromStoreData } from "../store-metadata"

vi.mock("@/lib/database/ingredients-db", () => ({
  normalizeStoreName: (name: string) => name.toLowerCase().trim(),
}))

describe("buildStoreMetadataFromRows", () => {
  it("returns an empty map for an empty array", () => {
    const result = buildStoreMetadataFromRows([])
    expect(result.size).toBe(0)
  })

  it("maps normalized store name to metadata", () => {
    const result = buildStoreMetadataFromRows([
      {
        store_enum: "KROGER",
        grocery_store_id: "store-123",
        zip_code: "94704",
        latitude: 37.8,
        longitude: -122.2,
        distance_miles: 1.5,
      },
    ])

    expect(result.has("kroger")).toBe(true)
    const meta = result.get("kroger")!
    expect(meta.storeId).toBe("store-123")
    expect(meta.grocery_store_id).toBe("store-123")
    expect(meta.zipCode).toBe("94704")
    expect(meta.latitude).toBe(37.8)
    expect(meta.longitude).toBe(-122.2)
    expect(meta.distanceMiles).toBe(1.5)
  })

  it("handles multiple rows", () => {
    const result = buildStoreMetadataFromRows([
      { store_enum: "KROGER", grocery_store_id: "k1" },
      { store_enum: "TARGET", grocery_store_id: "t1" },
    ])

    expect(result.size).toBe(2)
    expect(result.has("kroger")).toBe(true)
    expect(result.has("target")).toBe(true)
  })

  it("sets null for missing optional fields", () => {
    const result = buildStoreMetadataFromRows([
      { store_enum: "ALDI", grocery_store_id: "a1" },
    ])

    const meta = result.get("aldi")!
    expect(meta.zipCode).toBeNull()
    expect(meta.latitude).toBeNull()
    expect(meta.longitude).toBeNull()
    expect(meta.distanceMiles).toBeNull()
  })

  it("converts string latitude/longitude to numbers", () => {
    const result = buildStoreMetadataFromRows([
      {
        store_enum: "WHOLE_FOODS",
        grocery_store_id: "wf1",
        latitude: "37.123" as unknown as number,
        longitude: "-122.456" as unknown as number,
        distance_miles: "2.5" as unknown as number,
      },
    ])

    const meta = result.get("whole_foods")!
    expect(meta.latitude).toBe(37.123)
    expect(meta.longitude).toBe(-122.456)
    expect(meta.distanceMiles).toBe(2.5)
  })

  it("sets null for non-numeric latitude/longitude values", () => {
    const result = buildStoreMetadataFromRows([
      {
        store_enum: "STORE",
        grocery_store_id: "s1",
        latitude: "invalid" as unknown as number,
        longitude: NaN as unknown as number,
      },
    ])

    const meta = result.get("store")!
    expect(meta.latitude).toBeNull()
    expect(meta.longitude).toBeNull()
  })

  it("last row wins when two rows share the same normalized store name", () => {
    const result = buildStoreMetadataFromRows([
      { store_enum: "KROGER", grocery_store_id: "first" },
      { store_enum: "kroger", grocery_store_id: "second" },
    ])

    expect(result.get("kroger")!.storeId).toBe("second")
  })
})

describe("buildStoreMetadataFromStoreData", () => {
  it("returns an empty map for an empty map input", () => {
    const result = buildStoreMetadataFromStoreData(new Map())
    expect(result.size).toBe(0)
  })

  it("maps store key to metadata from StoreData object", () => {
    const stores = new Map([
      [
        "kroger",
        {
          storeId: "store-456",
          grocery_store_id: "store-456",
          zip_code: "90210",
          latitude: 34.0,
          longitude: -118.5,
          distance_miles: 3.2,
        },
      ],
    ])

    const result = buildStoreMetadataFromStoreData(stores)
    const meta = result.get("kroger")!

    expect(meta.storeId).toBe("store-456")
    expect(meta.grocery_store_id).toBe("store-456")
    expect(meta.zipCode).toBe("90210")
    expect(meta.latitude).toBe(34.0)
    expect(meta.longitude).toBe(-118.5)
    expect(meta.distanceMiles).toBe(3.2)
  })

  it("falls back to id when storeId is absent", () => {
    const stores = new Map([["target", { id: "id-789" }]])
    const result = buildStoreMetadataFromStoreData(stores)
    expect(result.get("target")!.storeId).toBe("id-789")
  })

  it("prefers storeId over id", () => {
    const stores = new Map([["store", { storeId: "preferred", id: "fallback" }]])
    const result = buildStoreMetadataFromStoreData(stores)
    expect(result.get("store")!.storeId).toBe("preferred")
  })

  it("falls back to storeId for grocery_store_id when grocery_store_id is absent", () => {
    const stores = new Map([["store", { storeId: "sid" }]])
    const result = buildStoreMetadataFromStoreData(stores)
    expect(result.get("store")!.grocery_store_id).toBe("sid")
  })

  it("sets null for missing optional fields", () => {
    const stores = new Map([["store", {}]])
    const result = buildStoreMetadataFromStoreData(stores)
    const meta = result.get("store")!
    expect(meta.zipCode).toBeNull()
    expect(meta.latitude).toBeNull()
    expect(meta.longitude).toBeNull()
    expect(meta.distanceMiles).toBeNull()
  })

  it("handles multiple stores", () => {
    const stores = new Map([
      ["kroger", { storeId: "k1" }],
      ["target", { storeId: "t1" }],
      ["walmart", { storeId: "w1" }],
    ])
    const result = buildStoreMetadataFromStoreData(stores)
    expect(result.size).toBe(3)
  })
})
