import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter, mockSearchParams } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockAddItem = vi.fn()
const mockSaveChanges = vi.fn()
const mockAddRecipeToCart = vi.fn()
const mockUpdateRecipeServings = vi.fn()
const mockPerformMassSearch = vi.fn()
const mockScrollToStore = vi.fn()
const mockReplaceItemForStore = vi.fn()
const mockSetSortMode = vi.fn()
const mockResetComparison = vi.fn()
const mockFetchProfileFields = vi.fn()
const mockGetUserLocation = vi.fn()
const mockReverseGeocodeToPostalCode = vi.fn()
const mockBulkAddToDeliveryLog = vi.fn()
const mockFindDeliveryHistory = vi.fn()

let mockAuthState = {
  user: { id: "user_1" },
  loading: false,
}

let mockShoppingList = [
  {
    id: "list_1",
    name: "Milk",
    quantity: 2,
    unit: "cartons",
    ingredient_id: "std_milk",
    standardizedIngredientId: "std_milk",
  },
]

let mockMassSearchResults = [
  {
    store: "Best Grocery",
    items: [
      {
        shoppingItemId: "list_1",
        productMappingId: "product_1",
        packagesToBuy: 2,
        quantity: 2,
        price: 5.5,
      },
    ],
  },
]

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
  useShoppingList: () => ({
    items: mockShoppingList,
    addItem: mockAddItem,
    updateQuantity: vi.fn(),
    updateItemName: vi.fn(),
    removeItem: vi.fn(),
    removeRecipe: vi.fn(),
    toggleChecked: vi.fn(),
    addRecipeToCart: mockAddRecipeToCart,
    updateRecipeServings: mockUpdateRecipeServings,
    saveChanges: mockSaveChanges,
  }),
  useStoreComparison: () => ({
    activeStoreIndex: 0,
    results: mockMassSearchResults,
    loading: false,
    hasFetched: true,
    performMassSearch: mockPerformMassSearch,
    scrollToStore: mockScrollToStore,
    replaceItemForStore: mockReplaceItemForStore,
    sortMode: "best-value",
    setSortMode: mockSetSortMode,
    resetComparison: mockResetComparison,
  }),
}))

vi.mock("@/lib/database/profile-db", () => ({
  profileDB: {
    fetchProfileFields: mockFetchProfileFields,
  },
}))

vi.mock("@/lib/location-client", () => ({
  getUserLocation: mockGetUserLocation,
  reverseGeocodeToPostalCode: mockReverseGeocodeToPostalCode,
}))

vi.mock("@/lib/database/store-list-history-db", () => ({
  storeListHistoryDB: {
    bulkAddToDeliveryLog: mockBulkAddToDeliveryLog,
    findByUserId: mockFindDeliveryHistory,
  },
}))

vi.mock("@/components/store/store-list", () => ({
  ShoppingListSection: ({ shoppingList }: { shoppingList: Array<{ name: string }> }) => (
    <div>{`Shopping list size: ${shoppingList.length}`}</div>
  ),
}))

vi.mock("@/components/store/store-comparison", () => ({
  StoreComparisonSection: ({ massSearchResults }: { massSearchResults: Array<{ store: string }> }) => (
    <div>{`Comparison for ${massSearchResults[0]?.store ?? "none"}`}</div>
  ),
}))

vi.mock("@/components/store/store-replacement", () => ({
  ItemReplacementModal: () => null,
}))

vi.mock("@/components/recipe/detail/recipe-recommendation-modal", () => ({
  RecipeSearchModal: () => null,
}))

describe("ShoppingPage", () => {
  let ShoppingPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { id: "user_1" },
      loading: false,
    }
    mockShoppingList = [
      {
        id: "list_1",
        name: "Milk",
        quantity: 2,
        unit: "cartons",
        ingredient_id: "std_milk",
        standardizedIngredientId: "std_milk",
      },
    ]
    mockMassSearchResults = [
      {
        store: "Best Grocery",
        items: [
          {
            shoppingItemId: "list_1",
            productMappingId: "product_1",
            packagesToBuy: 2,
            quantity: 2,
            price: 5.5,
          },
        ],
      },
    ]
    mockFetchProfileFields.mockResolvedValue({ zip_code: "94105" })
    mockGetUserLocation.mockResolvedValue(null)
    mockReverseGeocodeToPostalCode.mockResolvedValue(null)
    mockSaveChanges.mockResolvedValue(undefined)
    mockPerformMassSearch.mockResolvedValue(undefined)
    mockBulkAddToDeliveryLog.mockResolvedValue([
      {
        success: true,
        price_matched: true,
        shopping_list_item_id: "list_1",
      },
    ])
    mockFindDeliveryHistory.mockResolvedValue([{ order_id: "order_1" }])

    mockRouter()
    mockSearchParams("")
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    const mod = await import("../page")
    ShoppingPage = mod.default
  })

  it("saves pending changes and runs comparison before showing store results", async () => {
    const user = userEvent.setup()

    render(<ShoppingPage />)

    await waitFor(() => {
      expect(screen.getByText(/shopping list size: 1/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /compare prices/i }))

    await waitFor(() => {
      expect(mockSaveChanges).toHaveBeenCalled()
      expect(mockPerformMassSearch).toHaveBeenCalledWith({ skipPricingGaps: false })
      expect(screen.getByText(/comparison for best grocery/i)).toBeInTheDocument()
    })
  })

  it("creates a delivery order from the best comparison result and routes to the order detail page", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<ShoppingPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compare prices/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /compare prices/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /proceed to checkout/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /proceed to checkout/i }))

    await waitFor(() => {
      expect(mockBulkAddToDeliveryLog).toHaveBeenCalledWith([
        expect.objectContaining({
          item_id: "list_1",
          product_id: "product_1",
          num_pkgs: 2,
          frontend_price: 5.5,
        }),
      ])
      expect(router.push).toHaveBeenCalledWith("/delivery/order_1")
    })
  })
})
