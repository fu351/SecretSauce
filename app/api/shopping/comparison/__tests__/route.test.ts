import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockFrom, finalQuery, builder } = vi.hoisted(() => {
  const finalQuery = {
    data: [] as any[],
    error: null as any,
    eq: vi.fn(),
  }

  const builder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn(() => finalQuery),
  }

  const mockFrom = vi.fn(() => builder)

  return { mockFrom, finalQuery, builder }
})

vi.mock("@/lib/database/base-db", () => ({
  from: mockFrom,
}))

import { POST } from "../route"

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/shopping/comparison", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /api/shopping/comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    builder.select.mockReturnThis()
    builder.in.mockReturnThis()
    builder.order.mockReturnValue(finalQuery)
    finalQuery.data = []
    finalQuery.error = null
    finalQuery.eq.mockResolvedValue(finalQuery)
  })

  it("returns an empty result when no valid items are provided", async () => {
    const response = await POST(makeRequest({ items: [{ id: "", name: "" }] }) as any)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("groups cached prices by store and computes totals and savings", async () => {
    finalQuery.data = [
      {
        shopping_list_item_id: "item_1",
        store: "walmart",
        store_name: "Walmart Supercenter",
        product_name: "Organic Milk",
        price: 2.5,
        unit_price: 1.25,
        image_url: "https://cdn.example.com/milk.png",
      },
      {
        shopping_list_item_id: "item_1",
        store: "target",
        store_name: "Target",
        product_name: "Whole Milk",
        price: 3.5,
        unit_price: 1.75,
        image_url: "",
      },
    ]

    const response = await POST(
      makeRequest({
        items: [{ id: "item_1", name: "Milk", quantity: 2, unit: "gallon", category: "dairy" }],
      }) as any
    )
    const payload = await response.json()

    expect(mockFrom).toHaveBeenCalledWith("shopping_item_price_cache")
    expect(builder.in).toHaveBeenCalledWith("shopping_list_item_id", ["item_1"])
    expect(payload.results).toHaveLength(2)
    expect(payload.results[0]).toMatchObject({
      store: "Walmart",
      total: 5,
      missingItems: false,
      savings: 2,
    })
    expect(payload.results[1]).toMatchObject({
      store: "Target",
      total: 7,
      savings: 0,
    })
  })

  it("filters the query by zip code when one is provided", async () => {
    finalQuery.data = [
      {
        shopping_list_item_id: "item_1",
        store: "aldi",
        store_name: "Aldi",
        product_name: "Milk",
        price: 2,
        unit_price: null,
        image_url: "",
      },
    ]

    const response = await POST(
      makeRequest({
        zipCode: "94110",
        items: [{ id: "item_1", name: "Milk", quantity: 1 }],
      }) as any
    )

    expect(finalQuery.eq).toHaveBeenCalledWith("zip_code", "94110")
    expect(response.status).toBe(200)
  })

  it("returns 500 when the cache query fails", async () => {
    finalQuery.error = { message: "db unavailable" }

    const response = await POST(
      makeRequest({
        items: [{ id: "item_1", name: "Milk", quantity: 1 }],
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Unable to load cached prices",
    })
  })
})
