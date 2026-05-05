import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFetchRecipesByAuthor = vi.fn()
const mockFetchFavoriteRecipeIds = vi.fn()
const mockFetchUserCollectionsWithCounts = vi.fn()
const mockFetchMealScheduleByWeekIndex = vi.fn()
const mockFetchUserItems = vi.fn()

let mockAuthState = {
  user: { id: "user_1", email: "chef@example.com" },
  profile: { tutorial_completed: false },
}

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipesByAuthor: mockFetchRecipesByAuthor,
  },
}))

vi.mock("@/lib/database/recipe-favorites-db", () => ({
  recipeFavoritesDB: {
    fetchFavoriteRecipeIds: mockFetchFavoriteRecipeIds,
  },
  recipeCollectionsDB: {
    fetchUserCollectionsWithCounts: mockFetchUserCollectionsWithCounts,
  },
}))

vi.mock("@/lib/database/meal-planner-db", () => ({
  mealPlannerDB: {
    fetchMealScheduleByWeekIndex: mockFetchMealScheduleByWeekIndex,
  },
}))

vi.mock("@/lib/database/store-list-db", () => ({
  shoppingListDB: {
    fetchUserItems: mockFetchUserItems,
  },
}))

vi.mock("@/hooks/use-feature-preferences", () => ({
  useFeaturePreferences: () => ({
    error: null,
    loading: false,
    preferences: {},
    updatePreferences: vi.fn(),
    updatePreferencesAsync: vi.fn(),
    updating: false,
  }),
}))

vi.mock("@/components/recipe/cards/recipe-card", () => ({
  RecipeCard: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/shared/ios-webapp-prompt-banner", () => ({
  default: () => <div data-testid="ios-banner">iOS Prompt</div>,
}))

vi.mock("@/components/shared/ios-webapp-install-modal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="ios-install-modal">Install Modal</div> : null,
}))

vi.mock("@/components/dashboard/graph-tracker", () => ({
  GraphTracker: () => <div data-testid="graph-tracker">Graph Tracker</div>,
}))

vi.mock("@/components/social/profile-card", () => ({
  ProfileCard: () => <div data-testid="profile-card">Profile Card</div>,
}))

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils")
  return {
    ...actual,
    shouldShowIOSPrompt: vi.fn(() => false),
  }
})

describe("DashboardPage", () => {
  let DashboardPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    ;[sessionStorage, localStorage].forEach((storage) => {
      const keys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key !== null) keys.push(key)
      }
      keys.forEach((key) => storage.removeItem(key))
    })
    mockAuthState = {
      user: { id: "user_1", email: "chef@example.com" },
      profile: { tutorial_completed: false },
    }

    mockFetchRecipesByAuthor
      .mockResolvedValueOnce([
        { id: "recipe-1", title: "Crispy Tacos" },
        { id: "recipe-2", title: "Tomato Soup" },
      ])
      .mockResolvedValueOnce([{ id: "recipe-3", title: "Lemon Pasta" }])
    mockFetchFavoriteRecipeIds.mockResolvedValue(["recipe-1"])
    mockFetchUserCollectionsWithCounts.mockResolvedValue([
      { id: "collection-1", name: "Weeknight Dinners", recipe_count: 3, is_default: false },
    ])
    mockFetchMealScheduleByWeekIndex.mockResolvedValue([{ id: "meal-1" }, { id: "meal-2" }])
    mockFetchUserItems.mockResolvedValue([{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }])

    const mod = await import("../page")
    DashboardPage = mod.default
  })

  it("loads dashboard data and renders recent recipes", async () => {
    render(<DashboardPage />)

    await waitFor(() => {
      expect(mockFetchRecipesByAuthor).toHaveBeenNthCalledWith(1, "user_1", { limit: 1000 })
      expect(mockFetchFavoriteRecipeIds).toHaveBeenCalledWith("user_1")
      expect(mockFetchMealScheduleByWeekIndex).toHaveBeenCalledWith("user_1", expect.any(Number))
      expect(mockFetchUserItems).toHaveBeenCalledWith("user_1")
      expect(screen.getByText("Lemon Pasta")).toBeInTheDocument()
    })

    expect(screen.getByText(/welcome back, chef/i)).toBeInTheDocument()
    expect(screen.getByTestId("graph-tracker")).toBeInTheDocument()
    expect(screen.queryByTestId("premium-upgrade-widget")).not.toBeInTheDocument()
    expect(screen.queryByTestId("friends-widget")).not.toBeInTheDocument()
    expect(screen.queryByTestId("notifications-widget")).not.toBeInTheDocument()
  })

  it("renders the empty recent-recipes state when no recipes exist", async () => {
    mockFetchRecipesByAuthor.mockReset()
    mockFetchRecipesByAuthor.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument()
      expect(screen.getByRole("link", { name: /upload recipe/i })).toHaveAttribute("href", "/upload-recipe")
    })
  })
})
