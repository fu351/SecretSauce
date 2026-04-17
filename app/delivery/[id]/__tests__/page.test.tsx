import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useParams, useRouter } from "next/navigation"

const mockFindByOrderIdWithJoins = vi.fn()
const mockFindById = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({ user: { id: "user_1" } })),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/lib/database/store-list-history-db", () => ({
  storeListHistoryDB: {
    findByOrderIdWithJoins: mockFindByOrderIdWithJoins,
  },
}))

vi.mock("@/lib/database/delivery-orders-db", () => ({
  deliveryOrdersDB: {
    findById: mockFindById,
  },
}))

describe("OrderDetailPage", () => {
  let OrderDetailPage: React.ComponentType
  const mockPush = vi.fn()
  const mockRouter = {
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }
  const mockParams = { id: "order_1" }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(useParams).mockReturnValue(mockParams as any)
    vi.mocked(useRouter).mockReturnValue(mockRouter as any)
    mockFindById.mockResolvedValue({
      id: "order_1",
      user_id: "user_1",
      subtotal: 11,
      flat_fee: 6.99,
      basket_fee_rate: 0.05,
      basket_fee_amount: 0.55,
      total_delivery_fee: 7.54,
      grand_total: 18.54,
      subscription_tier_at_checkout: "free",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z",
    })
    mockFindByOrderIdWithJoins.mockResolvedValue([
      {
        id: "row_1",
        grocery_store_id: "store_1",
        delivery_date: "2030-01-02T00:00:00.000Z",
        week_index: 203001,
        is_delivery_confirmed: false,
        created_at: "2030-01-01T00:00:00.000Z",
        quantity_needed: 2,
        price_at_selection: 3.5,
        total_item_price: 7,
        grocery_stores: {
          name: "Walmart",
          address: "123 Market St",
        },
        standardized_ingredients: {
          canonical_name: "Milk",
        },
      },
      {
        id: "row_2",
        grocery_store_id: "store_1",
        delivery_date: "2030-01-02T00:00:00.000Z",
        week_index: 203001,
        is_delivery_confirmed: false,
        created_at: "2030-01-01T00:00:00.000Z",
        quantity_needed: 1,
        price_at_selection: 4,
        total_item_price: 4,
        grocery_stores: {
          name: "Walmart",
          address: "123 Market St",
        },
        standardized_ingredients: {
          canonical_name: "Eggs",
        },
      },
    ])

    const mod = await import("../page")
    OrderDetailPage = mod.default
  })

  it("redirects to the delivery list when the order cannot be found", async () => {
    mockFindByOrderIdWithJoins.mockResolvedValue([])
    mockFindById.mockResolvedValue(null)
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/delivery")
    })
  })

  it("renders grouped order details and supports the back button", async () => {
    const user = userEvent.setup()
    render(<OrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText(/order #ORDER_1/i)).toBeInTheDocument()
      expect(screen.getByText("Walmart")).toBeInTheDocument()
      expect(screen.getByText("Milk")).toBeInTheDocument()
      expect(screen.getByText("Eggs")).toBeInTheDocument()
      expect(screen.getByText("Order Total")).toBeInTheDocument()
      // grand total from fees (appears in header and fee summary)
      expect(screen.getAllByText("$18.54")).toHaveLength(2)
      // fee summary section
      expect(screen.getByText("Fee Summary")).toBeInTheDocument()
      expect(screen.getByText("$6.99")).toBeInTheDocument()
      expect(screen.getByText(/basket fee \(5%\)/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /back to orders/i }))
    expect(mockPush).toHaveBeenCalledWith("/delivery")
  })
})
