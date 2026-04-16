import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockAddRecipesToCart = vi.fn()
const mockAddRecipeToCart = vi.fn()
const mockLoadAllRecipes = vi.fn()
const mockUseHeuristicPlan = vi.fn()
const mockAddToMealPlan = vi.fn()
const mockRemoveFromMealPlan = vi.fn()
const mockReloadWeeklyPlan = vi.fn()
const mockClearWeek = vi.fn()
const mockSetHighlightSlot = vi.fn()
const mockHighlightNextEmptySlotAfter = vi.fn()

let mockHasSmartPlannerAccess = false

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockRecipeSearchPanel({
      onSelect,
      onToggleCollapse,
    }: {
      onSelect: (recipe: { id: string; title: string }) => void
      onToggleCollapse: () => void
    }) {
      return (
        <div>
          <button type="button" onClick={() => onSelect({ id: "recipe_9", title: "Selected Curry" })}>
            Select sidebar recipe
          </button>
          <button type="button" onClick={onToggleCollapse}>
            Collapse sidebar
          </button>
        </div>
      )
    },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user_1" },
  })),
}))

vi.mock("@/hooks/use-subscription", () => ({
  useHasAccess: vi.fn(() => ({
    hasAccess: mockHasSmartPlannerAccess,
    loading: false,
  })),
}))

vi.mock("@/hooks", () => ({
  useIsMobile: vi.fn(() => false),
  useToast: () => ({ toast: mockToast }),
  useShoppingList: () => ({
    addRecipesToCart: mockAddRecipesToCart,
    addRecipeToCart: mockAddRecipeToCart,
  }),
  useMealPlannerRecipes: () => ({
    loadAllRecipes: mockLoadAllRecipes,
  }),
  useMealPlannerNutrition: () => ({
    weeklyNutritionSummary: {
      totals: { calories: 1400 },
      averages: { calories: 200 },
    },
  }),
  useHeuristicPlan: mockUseHeuristicPlan,
  useMealPlannerDragDrop: () => ({
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
    getDraggableProps: vi.fn(() => ({})),
    getDroppableProps: vi.fn(() => ({})),
    activeDragData: null,
    activeDropTarget: null,
    setHighlightSlot: mockSetHighlightSlot,
    highlightNextEmptySlotAfter: mockHighlightNextEmptySlotAfter,
  }),
  useWeeklyMealPlan: () => ({
    meals: [{ date: "2030-01-01", meal_type: "breakfast", recipe_id: "recipe_1" }],
    recipesById: {
      recipe_1: { id: "recipe_1", title: "Breakfast Bowl" },
    },
    reload: mockReloadWeeklyPlan,
    addToMealPlan: mockAddToMealPlan,
    removeFromMealPlan: mockRemoveFromMealPlan,
    clearWeek: mockClearWeek,
  }),
}))

vi.mock("@/components/auth/tier-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/meal-planner/controls/planner-actions", () => ({
  PlannerActions: ({
    onHeuristicPlan,
    onAddToCart,
  }: {
    onHeuristicPlan: () => void
    onAddToCart: () => void
  }) => (
    <div>
      <button type="button" onClick={onHeuristicPlan}>
        Smart weekly planner
      </button>
      <button type="button" onClick={onAddToCart}>
        Add meals to shopping list
      </button>
    </div>
  ),
}))

vi.mock("@/components/meal-planner/cards/nutrition-summary-card", () => ({
  NutritionSummaryCard: ({ weeklyTotals }: { weeklyTotals: { calories: number } }) => (
    <div>{`Weekly calories: ${weeklyTotals.calories}`}</div>
  ),
}))

vi.mock("@/components/meal-planner/views/weekly-view", () => ({
  WeeklyView: ({
    meals,
    onAdd,
  }: {
    meals: Array<{ recipe_id: string }>
    onAdd: (mealType: string, date: string) => void
  }) => (
    <div>
      <div>{`Weekly meals: ${meals.length}`}</div>
      <button type="button" onClick={() => onAdd("breakfast", "2030-01-02")}>
        Open breakfast slot
      </button>
    </div>
  ),
}))

vi.mock("@/components/meal-planner/cards/drag-preview-card", () => ({
  DragPreviewCard: () => <div>Drag preview</div>,
}))

vi.mock("@/components/recipe/detail/recipe-detail-modal", () => ({
  RecipeDetailModal: () => null,
}))

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    children,
  }: {
    open?: boolean
    children: React.ReactNode
  }) => <>{open ? children : null}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("MealPlannerPage", () => {
  let MealPlannerPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockHasSmartPlannerAccess = false
    mockAddRecipesToCart.mockResolvedValue(1)
    mockAddRecipeToCart.mockResolvedValue(undefined)
    mockLoadAllRecipes.mockResolvedValue(undefined)
    mockUseHeuristicPlan.mockResolvedValue({ meals: [], explanation: "Week already planned." })
    mockAddToMealPlan.mockResolvedValue(undefined)
    mockRemoveFromMealPlan.mockResolvedValue(undefined)
    mockReloadWeeklyPlan.mockResolvedValue(undefined)
    mockClearWeek.mockResolvedValue(true)
    mockRouter()

    const mod = await import("../page")
    MealPlannerPage = mod.default
  })

  it("sends locked users to pricing when they try to use the smart planner", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<MealPlannerPage />)

    await waitFor(() => {
      expect(screen.getByText(/weekly meals: 1/i)).toBeInTheDocument()
      expect(mockLoadAllRecipes).toHaveBeenCalled()
    })

    await user.click(screen.getByRole("button", { name: /smart weekly planner/i }))

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Premium feature",
      })
    )
    expect(router.push).toHaveBeenCalledWith("/pricing?required=premium")
  })

  it("adds the current week to the shopping list and routes to the store view", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<MealPlannerPage />)

    await user.click(screen.getByRole("button", { name: /add meals to shopping list/i }))

    await waitFor(() => {
      expect(mockAddRecipesToCart).toHaveBeenCalledWith(["recipe_1"])
      expect(router.push).toHaveBeenCalledWith("/store?expandList=true")
    })
  })

  it("opens the recipe selector from the grid and adds the chosen recipe to the selected slot", async () => {
    const user = userEvent.setup()

    render(<MealPlannerPage />)

    await user.click(screen.getByRole("button", { name: /open breakfast slot/i }))

    await waitFor(() => {
      expect(mockSetHighlightSlot).toHaveBeenCalledWith("breakfast", "2030-01-02")
      expect(screen.getByRole("button", { name: /select sidebar recipe/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /select sidebar recipe/i }))

    await waitFor(() => {
      expect(mockAddToMealPlan).toHaveBeenCalledWith(
        { id: "recipe_9", title: "Selected Curry" },
        "breakfast",
        "2030-01-02"
      )
    })
  })
})
