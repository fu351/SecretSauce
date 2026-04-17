import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockParams, mockRouter } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockAddRecipeToCart = vi.fn()
const mockFetchRecipeById = vi.fn()
const mockFindByRecipeIdWithStandardized = vi.fn()
const mockIsFavorite = vi.fn()
const mockToggleFavorite = vi.fn()

let mockAuthState = {
  user: { id: "user_1" },
}

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
  useShoppingList: () => ({ addRecipeToCart: mockAddRecipeToCart }),
}))

vi.mock("@/components/recipe/cards/recipe-skeleton", () => ({
  RecipeDetailSkeleton: () => <div>Recipe detail loading</div>,
}))

vi.mock("@/components/recipe/detail/recipe-reviews", () => ({
  RecipeReviews: ({ recipeId }: { recipeId: string }) => <div>{`Reviews for ${recipeId}`}</div>,
}))

vi.mock("@/components/recipe/detail/recipe-pricing-info", () => ({
  RecipePricingInfo: ({ recipeId }: { recipeId: string }) => <div>{`Pricing for ${recipeId}`}</div>,
}))

vi.mock("@/components/recipe/tags/tag-selector", () => ({
  TagSelector: ({ tags }: { tags: string[] }) => <div>{`Tags: ${tags.join(", ")}`}</div>,
}))

vi.mock("@/lib/image-helper", () => ({
  getRecipeImageUrl: vi.fn((value: string | null | undefined) => value ?? "/placeholder.svg"),
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipeById: mockFetchRecipeById,
  },
}))

vi.mock("@/lib/database/recipe-ingredients-db", () => ({
  recipeIngredientsDB: {
    findByRecipeIdWithStandardized: mockFindByRecipeIdWithStandardized,
  },
}))

vi.mock("@/lib/database/recipe-favorites-db", () => ({
  recipeFavoritesDB: {
    isFavorite: mockIsFavorite,
    toggleFavorite: mockToggleFavorite,
  },
}))

describe("RecipeDetailPage", () => {
  let RecipeDetailPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { id: "user_1" },
    }
    mockAddRecipeToCart.mockResolvedValue(undefined)
    mockIsFavorite.mockResolvedValue(false)
    mockToggleFavorite.mockResolvedValue(true)
    mockParams({ id: "recipe_1" })
    mockRouter()

    mockFetchRecipeById.mockResolvedValue({
      id: "recipe_1",
      title: "Tomato Soup",
      author_id: "user_1",
      prep_time: 10,
      cook_time: 20,
      servings: 4,
      difficulty: "beginner",
      rating_avg: 4.7,
      rating_count: 12,
      tags: ["comfort", "winter"],
      nutrition: { calories: 320 },
      content: {
        description: "A cozy bowl for cold nights.",
        image_url: "/tomato-soup.jpg",
        instructions: [{ description: "Simmer everything." }],
      },
      ingredients: [],
    })

    mockFindByRecipeIdWithStandardized.mockResolvedValue([
      {
        id: "ingredient_1",
        display_name: "2 cups tomatoes",
        quantity: 2,
        units: "cups",
        standardized_ingredient_id: "std_1",
        standardized_ingredient: {
          canonical_name: "Tomatoes",
        },
      },
    ])

    const mod = await import("../page")
    RecipeDetailPage = mod.default
  })

  it("loads the recipe detail, lets the owner edit, and adds the recipe to the shopping list", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<RecipeDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /tomato soup/i })).toBeInTheDocument()
      expect(screen.getByText(/a cozy bowl for cold nights/i)).toBeInTheDocument()
      expect(screen.getByText(/pricing for recipe_1/i)).toBeInTheDocument()
      expect(screen.getByText(/reviews for recipe_1/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /edit/i }))
    expect(router.push).toHaveBeenCalledWith("/edit-recipe/recipe_1")

    await user.click(screen.getByRole("button", { name: /add to cart/i }))
    expect(mockAddRecipeToCart).toHaveBeenCalledWith("recipe_1")
  })

  it("shows a sign-in prompt instead of toggling favorites for anonymous users", async () => {
    mockAuthState = { user: null }
    const mod = await import("../page")
    const Page = mod.default
    const user = userEvent.setup()

    const { container } = render(<Page />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /tomato soup/i })).toBeInTheDocument()
    })

    const favoriteButton = container.querySelector('[data-tutorial="recipe-favorite"]')
    expect(favoriteButton).not.toBeNull()
    await user.click(favoriteButton as HTMLElement)

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sign in required",
        variant: "destructive",
      })
    )
    expect(mockToggleFavorite).not.toHaveBeenCalled()
  })

  it("redirects back to recipes when the recipe cannot be loaded", async () => {
    const router = mockRouter()
    mockFetchRecipeById.mockRejectedValue(new Error("Recipe not found"))
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/recipes")
    })
  })
})
