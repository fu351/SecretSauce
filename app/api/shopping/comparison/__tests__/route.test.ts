import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockGetAuthenticatedProfile, mockRpc } = vi.hoisted(() => ({
  mockGetAuthenticatedProfile: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock("@/lib/foundation/server", () => ({
  getAuthenticatedProfile: mockGetAuthenticatedProfile,
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
    mockGetAuthenticatedProfile.mockResolvedValue({
      ok: true,
      profileId: "profile_1",
      clerkUserId: "clerk_1",
      supabase: { rpc: mockRpc },
    })
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it("returns an empty result when no valid items are provided", async () => {
    const response = await POST(makeRequest({ items: [{ id: "", name: "" }] }) as any)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
    expect(mockGetAuthenticatedProfile).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("requires an authenticated profile for live pricing", async () => {
    mockGetAuthenticatedProfile.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    })

    const response = await POST(
      makeRequest({
        items: [{ id: "item_1", name: "Milk", quantity: 1 }],
      }) as any,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
  })

  it("groups live get_pricing offers by store and computes totals and savings", async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          pricing_summary: [
            {
              standardized_ingredient_id: "ingredient_1",
              item_ids: ["item_1"],
              requested_unit: "gallon",
              total_amount: 2,
              offers: [
                {
                  store: "walmart",
                  store_name: "Walmart Supercenter",
                  product_name: "Organic Milk",
                  total_price: 5,
                  unit_price: 2.5,
                  image_url: "https://cdn.example.com/milk.png",
                  price_source: "open_prices",
                  price_store_id: "source_store_1",
                  used_price_backup: true,
                },
                {
                  store: "target",
                  store_name: "Target",
                  product_name: "Whole Milk",
                  total_price: 7,
                  unit_price: 3.5,
                  image_url: "",
                },
              ],
            },
          ],
        },
      ],
    })

    const response = await POST(
      makeRequest({
        items: [
          {
            id: "item_1",
            name: "Milk",
            quantity: 2,
            unit: "gallon",
            category: "dairy",
            ingredient_id: "ingredient_1",
          },
        ],
      }) as any,
    )
    const payload = await response.json()

    expect(mockRpc).toHaveBeenCalledWith("get_pricing", { p_user_id: "profile_1" })
    expect(payload.results).toHaveLength(2)
    expect(payload.results[0]).toMatchObject({
      store: "Walmart",
      total: 5,
      missingItems: false,
      savings: 2,
    })
    expect(payload.results[0].items[0]).toMatchObject({
      priceSource: "open_prices",
      priceStoreId: "source_store_1",
      usedPriceBackup: true,
    })
    expect(payload.results[1]).toMatchObject({
      store: "Target",
      total: 7,
      savings: 0,
    })
  })

  it("returns 500 when live pricing fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } })

    const response = await POST(
      makeRequest({
        items: [{ id: "item_1", name: "Milk", quantity: 1 }],
      }) as any,
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Unable to load live prices",
    })
  })
})
