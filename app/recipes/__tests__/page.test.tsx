import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter, mockSearchParams } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockMutateAsync = vi.fn()

let mockAuthState = {
  user: { id: "user_1" },
}

let mockRecipes = [
  { id: "recipe_1", title: "Tomato Soup" },
  { id: "recipe_2", title: "Roast Chicken" },
]

let mockLikedRecipeIds = ["recipe_2"]

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/hooks", () => ({
  useIsMobile: vi.fn(() => false),
  useToast: () => ({ toast: mockToast }),
  useRecipesFiltered: vi.fn(() => ({
    data: mockRecipes,
    isLoading: false,
    isFetching: false,
  })),
  useRecipesCount: vi.fn(() => ({
    data: 48,
    isFetching: false,
  })),
  useLikedRecipeIds: vi.fn(() => ({
    data: mockLikedRecipeIds,
  })),
  useRecipeCollections: vi.fn(() => ({
    data: [],
  })),
  useCollectionRecipeIds: vi.fn(() => ({
    data: [],
    isFetching: false,
  })),
  useToggleFavorite: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
  })),
}))

vi.mock("@/components/ui/pagination", () => ({
  Pagination: ({ onPageChange }: { onPageChange: (page: number) => void }) => (
    <button type="button" onClick={() => onPageChange(3)}>
      Go to page 3
    </button>
  ),
}))

vi.mock("@/components/recipe/recipe-header", () => ({
  RecipeHeader: () => <div>Recipe Header</div>,
}))

vi.mock("@/components/recipe/recipe-filter-sidebar", () => ({
  RecipeFilterSidebar: ({
    onUserRecipesToggle,
    onClearFilters,
  }: {
    onUserRecipesToggle: () => void
    onClearFilters: () => void
  }) => (
    <div>
      <button type="button" onClick={onUserRecipesToggle}>
        My recipes
      </button>
      <button type="button" onClick={onClearFilters}>
        Clear filters
      </button>
    </div>
  ),
}))

vi.mock("@/components/recipe/recipe-results-header", () => ({
  RecipeResultsHeader: ({
    searchTerm,
    page,
    totalCount,
    onPageChange,
  }: {
    searchTerm: string
    page: number
    totalCount: number
    onPageChange: (page: number) => void
  }) => (
    <div>
      <div data-testid="results-summary">{`search:${searchTerm}|page:${page}|count:${totalCount}`}</div>
      <button type="button" onClick={() => onPageChange(3)}>
        Header page change
      </button>
    </div>
  ),
}))

vi.mock("@/components/recipe/recipe-grid", () => ({
  RecipeGrid: ({
    recipes,
    onRecipeClick,
  }: {
    recipes: Array<{ id: string; title: string }>
    onRecipeClick: (id: string) => void
  }) => (
    <div>
      {recipes.map((recipe) => (
        <div key={recipe.id}>
          <button type="button" onClick={() => onRecipeClick(recipe.id)}>
            {`Open ${recipe.title}`}
          </button>
        </div>
      ))}
    </div>
  ),
}))

vi.mock("@/components/recipe/recipe-list-view", () => ({
  RecipeListView: () => <div>Recipe list view</div>,
}))

vi.mock("@/components/recipe/recipe-empty-state", () => ({
  RecipeEmptyState: ({ onClearFilters }: { onClearFilters: () => void }) => (
    <button type="button" onClick={onClearFilters}>
      Empty state clear
    </button>
  ),
}))

describe("RecipesPage", () => {
  let RecipesPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { id: "user_1" },
    }
    mockRecipes = [
      { id: "recipe_1", title: "Tomato Soup" },
      { id: "recipe_2", title: "Roast Chicken" },
    ]
    mockLikedRecipeIds = ["recipe_2"]
    mockMutateAsync.mockResolvedValue(undefined)

    mockRouter()
    mockSearchParams("")

    const mod = await import("../page")
    RecipesPage = mod.default
  })

  it("hydrates search state from the URL, routes to recipe details, and updates the page param", async () => {
    const router = mockRouter()
    mockSearchParams("search=soup&page=2&mine=true")

    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(screen.getByTestId("results-summary")).toHaveTextContent("search:soup|page:2|count:48")
    })

    fireEvent.click(screen.getByRole("button", { name: /open tomato soup/i }))
    expect(router.push).toHaveBeenCalledWith("/recipes/recipe_1")

    fireEvent.click(screen.getByRole("button", { name: /header page change/i }))

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        expect.stringContaining("page=3"),
        { scroll: false }
      )
      expect(router.replace).toHaveBeenCalledWith(
        expect.stringContaining("search=soup"),
        { scroll: false }
      )
      expect(router.replace).toHaveBeenCalledWith(
        expect.stringContaining("mine=true"),
        { scroll: false }
      )
    })
  })

  it("does not show a save button in tile view", async () => {
    mockAuthState = { user: null }

    render(<RecipesPage />)

    expect(screen.queryByRole("button", { name: /favorite tomato soup/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /save tomato soup/i })).not.toBeInTheDocument()
  })
})
