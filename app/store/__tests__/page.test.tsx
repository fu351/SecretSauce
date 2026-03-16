import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToast = vi.fn()
vi.mock('@/hooks', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockUser = { id: 'user_1', email: 'test@example.com', created_at: null }

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, profile: null, loading: false })),
}))

vi.mock('@/contexts/theme-context', () => ({
  useTheme: vi.fn(() => ({ theme: 'light' })),
}))

// Shopping list mock
const mockAddItem = vi.fn()
const mockAddRecipeToCart = vi.fn()
const mockRemoveItem = vi.fn()
const mockUpdateQuantity = vi.fn()
const mockSaveChanges = vi.fn()

vi.mock('@/hooks/shopping/use-shopping-list', () => ({
  useShoppingList: vi.fn(() => ({
    items: [],
    loading: false,
    addItem: mockAddItem,
    addRecipeToCart: mockAddRecipeToCart,
    removeItem: mockRemoveItem,
    updateQuantity: mockUpdateQuantity,
    saveChanges: mockSaveChanges,
  })),
}))

// Store comparison mock
const mockPerformMassSearch = vi.fn()
const mockScrollToStore = vi.fn()
const mockReplaceItemForStore = vi.fn()

vi.mock('@/hooks/shopping/use-store-comparison', () => ({
  useStoreComparison: vi.fn(() => ({
    activeStoreIndex: 0,
    results: [],
    loading: false,
    hasFetched: false,
    performMassSearch: mockPerformMassSearch,
    scrollToStore: mockScrollToStore,
    replaceItemForStore: mockReplaceItemForStore,
  })),
}))

vi.mock('@/lib/location-client', () => ({
  updateLocation: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/database/standardized-ingredients-db', () => ({
  standardizedIngredientsDB: {
    fetchByIds: vi.fn().mockResolvedValue([]),
  },
}))

// Profile DB — mocked via dynamic import
vi.mock('@/lib/database/profile-db', () => ({
  profileDB: {
    fetchProfileFields: vi.fn().mockResolvedValue({ zip_code: '90210' }),
  },
}))

// ---------------------------------------------------------------------------
// Child component mocks — expose callbacks via test buttons so we can trigger them
// ---------------------------------------------------------------------------

vi.mock('@/components/store/shopping-receipt-view', () => ({
  ShoppingReceiptView: ({
    onCheckout,
    onRefresh,
    onStoreChange,
    onSwapItem,
    loading,
    selectedStore,
    storeComparisons,
  }: any) => (
    <div data-testid="receipt-view">
      <span data-testid="receipt-loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="selected-store">{selectedStore ?? 'none'}</span>
      <span data-testid="store-count">{storeComparisons.length}</span>
      <button onClick={onCheckout} data-testid="checkout-btn">Checkout</button>
      <button onClick={onRefresh} data-testid="refresh-btn">Refresh</button>
      <button onClick={() => onStoreChange('Walmart')} data-testid="change-store-btn">Change Store</button>
      <button onClick={() => onStoreChange(null)} data-testid="clear-store-btn">Clear Store</button>
      <button onClick={() => onSwapItem('item_1')} data-testid="swap-btn">Swap</button>
    </div>
  ),
}))

vi.mock('@/components/store/store-replacement', () => ({
  ItemReplacementModal: ({ isOpen, onClose, onSelect }: any) =>
    isOpen ? (
      <div data-testid="swap-modal">
        <button
          onClick={() => onSelect({ title: 'Organic Apples', unit: 'each', price: 1.5 })}
          data-testid="confirm-swap-btn"
        >
          Confirm Swap
        </button>
        <button onClick={onClose} data-testid="close-modal-btn">Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/store/mobile-quick-add-panel', () => ({
  MobileQuickAddPanel: ({ onAddItem, onAddRecipe, onRemoveRecipe }: any) => (
    <div data-testid="mobile-panel">
      <button
        onClick={() => onAddItem('Milk')}
        data-testid="mobile-add-item-btn"
      >
        Add Milk
      </button>
      <button
        onClick={() => onAddRecipe('recipe_1', 'Pasta', 2)}
        data-testid="mobile-add-recipe-btn"
      >
        Add Recipe
      </button>
      <button
        onClick={() => onRemoveRecipe('recipe_1')}
        data-testid="mobile-remove-recipe-btn"
      >
        Remove Recipe
      </button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { useShoppingList } from '@/hooks/shopping/use-shopping-list'
import { useStoreComparison } from '@/hooks/shopping/use-store-comparison'
import { useAuth } from '@/contexts/auth-context'

function mockShoppingListWith(overrides: Partial<ReturnType<typeof useShoppingList>>) {
  vi.mocked(useShoppingList).mockReturnValue({
    items: [],
    loading: false,
    addItem: mockAddItem,
    addRecipeToCart: mockAddRecipeToCart,
    removeItem: mockRemoveItem,
    updateQuantity: mockUpdateQuantity,
    saveChanges: mockSaveChanges,
    ...overrides,
  } as any)
}

function mockStoreComparisonWith(overrides: Partial<ReturnType<typeof useStoreComparison>>) {
  vi.mocked(useStoreComparison).mockReturnValue({
    activeStoreIndex: 0,
    results: [],
    loading: false,
    hasFetched: false,
    performMassSearch: mockPerformMassSearch,
    scrollToStore: mockScrollToStore,
    replaceItemForStore: mockReplaceItemForStore,
    ...overrides,
  } as any)
}

const sampleItems = [
  {
    id: 'item_1',
    name: 'Apples',
    unit: 'each',
    quantity: 2,
    source_type: 'manual',
    recipe_id: null,
    ingredient_id: null,
    standardizedIngredientId: null,
  },
]

const sampleStoreComparisons = [
  {
    store: 'Walmart',
    groceryStoreId: 'store_1',
    items: [
      {
        shoppingItemId: 'item_1',
        shoppingItemIds: ['item_1'],
        productMappingId: 'prod_1',
        title: 'Apples',
        price: 0.99,
        quantity: 1,
        packagesToBuy: 2,
        packagePrice: 0.99,
        unit: 'each',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShoppingReceiptPage', () => {
  let ShoppingReceiptPage: React.ComponentType

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

    // Reset to defaults
    mockShoppingListWith({})
    mockStoreComparisonWith({})

    // Dynamically import to pick up fresh mocks
    const mod = await import('../page')
    ShoppingReceiptPage = mod.default
  })

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the receipt view and mobile panel', async () => {
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByTestId('receipt-view')).toBeInTheDocument()
        expect(screen.getByTestId('mobile-panel')).toBeInTheDocument()
      })
    })

    it('renders the Quick Add sidebar on desktop', async () => {
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByText('Quick Add')).toBeInTheDocument()
      })
    })

    it('shows loading state when list is loading', async () => {
      mockShoppingListWith({ loading: true })
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByTestId('receipt-loading')).toHaveTextContent('loading')
      })
    })

    it('shows ready state when list finishes loading', async () => {
      mockShoppingListWith({ loading: false })
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByTestId('receipt-loading')).toHaveTextContent('ready')
      })
    })

    it('shows loading state when items exist but comparison has not fetched yet', async () => {
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({ hasFetched: false })
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByTestId('receipt-loading')).toHaveTextContent('loading')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Auto-comparison
  // -------------------------------------------------------------------------

  describe('auto-comparison', () => {
    it('calls performMassSearch on mount when items are present', async () => {
      mockSaveChanges.mockResolvedValue(undefined)
      mockPerformMassSearch.mockResolvedValue(undefined)
      mockShoppingListWith({ items: sampleItems as any })

      render(<ShoppingReceiptPage />)

      await waitFor(() => {
        expect(mockPerformMassSearch).toHaveBeenCalledWith({
          showCachedFirst: true,
          skipPricingGaps: true,
        })
      })
    })

    it('does not call performMassSearch when shopping list is empty', async () => {
      mockShoppingListWith({ items: [] })
      render(<ShoppingReceiptPage />)

      // Wait a tick for effects to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      expect(mockPerformMassSearch).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Store selection
  // -------------------------------------------------------------------------

  describe('store change', () => {
    it('calls scrollToStore(0) when store is cleared', async () => {
      mockStoreComparisonWith({ results: sampleStoreComparisons as any })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('clear-store-btn'))
      await userEvent.click(screen.getByTestId('clear-store-btn'))
      expect(mockScrollToStore).toHaveBeenCalledWith(0)
    })

    it('calls scrollToStore with the correct index when a store is selected', async () => {
      mockStoreComparisonWith({ results: sampleStoreComparisons as any })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('change-store-btn'))
      await userEvent.click(screen.getByTestId('change-store-btn'))
      expect(mockScrollToStore).toHaveBeenCalledWith(0)
    })
  })

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  describe('refresh', () => {
    it('calls performMassSearch with skipPricingGaps: false on manual refresh', async () => {
      mockSaveChanges.mockResolvedValue(undefined)
      mockPerformMassSearch.mockResolvedValue(undefined)
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('refresh-btn'))
      await userEvent.click(screen.getByTestId('refresh-btn'))
      await waitFor(() => {
        expect(mockPerformMassSearch).toHaveBeenCalledWith(
          expect.objectContaining({ skipPricingGaps: false })
        )
      })
    })
  })

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  describe('checkout', () => {
    it('navigates to /checkout when checkout is triggered with no store data', async () => {
      const { push } = vi.mocked(useRouter)()
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('checkout-btn'))
      await userEvent.click(screen.getByTestId('checkout-btn'))
      expect(push).toHaveBeenCalledWith(expect.stringContaining('/checkout'))
    })

    it('includes total and items count in checkout URL', async () => {
      const { push } = vi.mocked(useRouter)()
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({
        results: sampleStoreComparisons as any,
        activeStoreIndex: 0,
        hasFetched: true,
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('checkout-btn'))
      await userEvent.click(screen.getByTestId('checkout-btn'))
      await waitFor(() => {
        expect(push).toHaveBeenCalledWith(
          expect.stringMatching(/\/checkout\?.*total=/)
        )
      })
    })

    it('includes cartItems in checkout URL when store has items with productMappingId', async () => {
      const { push } = vi.mocked(useRouter)()
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({
        results: sampleStoreComparisons as any,
        activeStoreIndex: 0,
        hasFetched: true,
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('checkout-btn'))
      await userEvent.click(screen.getByTestId('checkout-btn'))
      await waitFor(() => {
        expect(push).toHaveBeenCalledWith(
          expect.stringMatching(/cartItems=/)
        )
      })
    })
  })

  // -------------------------------------------------------------------------
  // Item swap / replacement
  // -------------------------------------------------------------------------

  describe('item swap', () => {
    it('opens the swap modal when swap is requested on an item', async () => {
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({
        results: sampleStoreComparisons as any,
        activeStoreIndex: 0,
        hasFetched: true,
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('swap-btn'))
      await userEvent.click(screen.getByTestId('swap-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('swap-modal')).toBeInTheDocument()
      })
    })

    it('closes the swap modal when dismissed', async () => {
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({
        results: sampleStoreComparisons as any,
        activeStoreIndex: 0,
        hasFetched: true,
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('swap-btn'))
      await userEvent.click(screen.getByTestId('swap-btn'))
      await waitFor(() => screen.getByTestId('close-modal-btn'))
      await userEvent.click(screen.getByTestId('close-modal-btn'))
      expect(screen.queryByTestId('swap-modal')).not.toBeInTheDocument()
    })

    it('calls replaceItemForStore and shows a toast on swap confirmation', async () => {
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({
        results: sampleStoreComparisons as any,
        activeStoreIndex: 0,
        hasFetched: true,
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('swap-btn'))
      await userEvent.click(screen.getByTestId('swap-btn'))
      await waitFor(() => screen.getByTestId('confirm-swap-btn'))
      await userEvent.click(screen.getByTestId('confirm-swap-btn'))
      expect(mockReplaceItemForStore).toHaveBeenCalled()
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Item Swapped' })
      )
    })

    it('shows an error toast when swapping without a store selected', async () => {
      mockShoppingListWith({ items: sampleItems as any })
      mockStoreComparisonWith({ results: [], hasFetched: true })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('swap-btn'))
      await userEvent.click(screen.getByTestId('swap-btn'))
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      )
      expect(screen.queryByTestId('swap-modal')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Mobile quick add
  // -------------------------------------------------------------------------

  describe('mobile add item', () => {
    it('calls addItem with the item name when mobile add is triggered', async () => {
      mockAddItem.mockResolvedValue(true)
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('mobile-add-item-btn'))
      await userEvent.click(screen.getByTestId('mobile-add-item-btn'))
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith('Milk', 1, 'piece')
      })
    })

    it('shows a toast when an item is successfully added', async () => {
      mockAddItem.mockResolvedValue(true)
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('mobile-add-item-btn'))
      await userEvent.click(screen.getByTestId('mobile-add-item-btn'))
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Item Added' })
        )
      })
    })

    it('does not show a toast when addItem returns falsy', async () => {
      mockAddItem.mockResolvedValue(null)
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('mobile-add-item-btn'))
      await userEvent.click(screen.getByTestId('mobile-add-item-btn'))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(mockToast).not.toHaveBeenCalled()
    })

    it('calls addRecipeToCart when a recipe is added via mobile panel', async () => {
      mockAddRecipeToCart.mockResolvedValue(undefined)
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('mobile-add-recipe-btn'))
      await userEvent.click(screen.getByTestId('mobile-add-recipe-btn'))
      await waitFor(() => {
        expect(mockAddRecipeToCart).toHaveBeenCalledWith('recipe_1', 2)
      })
    })

    it('calls removeItem for all items belonging to the recipe when a recipe is removed', async () => {
      const recipeItems = [
        { ...sampleItems[0], id: 'item_a', recipe_id: 'recipe_1' },
        { ...sampleItems[0], id: 'item_b', recipe_id: 'recipe_1' },
        { ...sampleItems[0], id: 'item_c', recipe_id: 'recipe_2' }, // different recipe
      ]
      mockShoppingListWith({ items: recipeItems as any })
      render(<ShoppingReceiptPage />)
      await waitFor(() => screen.getByTestId('mobile-remove-recipe-btn'))
      await userEvent.click(screen.getByTestId('mobile-remove-recipe-btn'))
      expect(mockRemoveItem).toHaveBeenCalledWith('item_a')
      expect(mockRemoveItem).toHaveBeenCalledWith('item_b')
      expect(mockRemoveItem).not.toHaveBeenCalledWith('item_c')
    })
  })

  // -------------------------------------------------------------------------
  // Unauthenticated state
  // -------------------------------------------------------------------------

  describe('unauthenticated', () => {
    it('still renders when user is null', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        profile: null,
        loading: false,
        signOut: vi.fn(),
        updateProfile: vi.fn(),
      })
      render(<ShoppingReceiptPage />)
      await waitFor(() => {
        expect(screen.getByTestId('receipt-view')).toBeInTheDocument()
      })
    })
  })
})
