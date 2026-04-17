import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockRequireAdmin = vi.fn()
const mockFrom = vi.fn()
const mockDeliveryMap = vi.fn()
const mockDeliveryManager = vi.fn()

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("../delivery-map", () => ({
  default: (props: unknown) => {
    mockDeliveryMap(props)
    return <div data-testid="delivery-map" />
  },
}))

vi.mock("../delivery-manager", () => ({
  default: (props: unknown) => {
    mockDeliveryManager(props)
    return <div data-testid="delivery-manager" />
  },
}))

function createDeliveryOrdersChain() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: "order_1",
              user_id: "user_1",
              subtotal: 24.5,
              flat_fee: 6.99,
              basket_fee_rate: 0.05,
              basket_fee_amount: 1.23,
              total_delivery_fee: 8.22,
              grand_total: 32.72,
              subscription_tier_at_checkout: "free",
              created_at: "2030-01-01T00:00:00.000Z",
              updated_at: "2030-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        }),
      }),
    }),
  }
}

function createStoreHistoryChain() {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: "row_1",
              order_id: "order_1",
              user_id: "user_1",
              grocery_store_id: "store_1",
              quantity_needed: 2,
              price_at_selection: 3.5,
              total_item_price: 7,
              week_index: 203001,
              is_delivery_confirmed: false,
              delivery_date: "2030-01-02T00:00:00.000Z",
              created_at: "2030-01-01T00:00:00.000Z",
              grocery_stores: { name: "Walmart", address: "123 Market St" },
              standardized_ingredients: { canonical_name: "Milk" },
            },
          ],
          error: null,
        }),
      }),
    }),
  }
}

function createProfilesChain() {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: "user_1",
            email: "user@example.com",
            full_name: "Test User",
            subscription_tier: "free",
            latitude: 37.79,
            longitude: -122.39,
            formatted_address: "123 Market St, San Francisco, CA",
            city: "San Francisco",
            state: "CA",
            zip_code: "94105",
          },
        ],
        error: null,
      }),
    }),
  }
}

describe("DevDeliveriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(undefined)
    mockFrom.mockImplementation((table: string) => {
      if (table === "delivery_orders") return createDeliveryOrdersChain()
      if (table === "store_list_history") return createStoreHistoryChain()
      if (table === "profiles") return createProfilesChain()
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it("passes profile coordinates into the delivery map", async () => {
    const mod = await import("../page")
    const Page = mod.default

    render(await Page())

    await waitFor(() => {
      expect(screen.getByTestId("delivery-map")).toBeInTheDocument()
      expect(screen.getByTestId("delivery-manager")).toBeInTheDocument()
    })

    expect(mockDeliveryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        orders: [
          expect.objectContaining({
            userLatitude: 37.79,
            userLongitude: -122.39,
            locationLabel: "123 Market St, San Francisco, CA",
          }),
        ],
      }),
    )
  })
})
