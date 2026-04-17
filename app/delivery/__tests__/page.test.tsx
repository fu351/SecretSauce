import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRouter } from "next/navigation"

const mockUseDeliveryOrders = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({ user: { id: "user_1" } })),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock("@/hooks/delivery/use-delivery-orders", () => ({
  useDeliveryOrders: () => mockUseDeliveryOrders(),
}))

describe("DeliveryPage", () => {
  let DeliveryPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)
    mockUseDeliveryOrders.mockReturnValue({
      currentOrders: [],
      pastOrders: [],
      loading: false,
      refetch: vi.fn(),
    })

    const mod = await import("../page")
    DeliveryPage = mod.default
  })

  it("shows a loading state while delivery data is loading", () => {
    mockUseDeliveryOrders.mockReturnValue({
      currentOrders: [],
      pastOrders: [],
      loading: true,
      refetch: vi.fn(),
    })

    render(<DeliveryPage />)

    expect(screen.getByText(/loading deliveries/i)).toBeInTheDocument()
  })

  it("renders the empty current-orders state and routes to the store", async () => {
    const user = userEvent.setup()
    render(<DeliveryPage />)

    await user.click(screen.getByRole("button", { name: /go to store/i }))

    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/store")
  })

  it("renders grouped current orders and supports navigation to order details", async () => {
    const user = userEvent.setup()
    mockUseDeliveryOrders.mockReturnValue({
      loading: false,
      refetch: vi.fn(),
      currentOrders: [
        {
          orderId: "order_1",
          deliveryDate: "2030-01-02T00:00:00.000Z",
          grandTotal: 24.5,
          isConfirmed: false,
          stores: [
            {
              storeId: "store_1",
              storeName: "Walmart",
              storeAddress: "123 Market St",
              total: 24.5,
              items: [
                {
                  id: "item_1",
                  ingredientName: "Milk",
                  quantity: 2,
                  packagePrice: 3.5,
                },
              ],
            },
          ],
        },
      ],
      pastOrders: [],
    })
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Walmart")).toBeInTheDocument()
      expect(screen.getByText("Milk")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /view details/i }))
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/delivery/order_1")
  })
})
