import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockParams, mockRouter } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockAddRecipeToCart = vi.fn()
const mockIsFavorite = vi.fn()
const mockToggleFavorite = vi.fn()
const mockFetch = vi.fn()

let mockAuthState = {
  user: { id: "user_1" },
}

let mockRecipeStatus = 200
let mockRecipePayload: Record<string, unknown> | null = null

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
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
  getDefaultImageFallback: vi.fn((theme?: string) => (theme === "dark" ? "/logo-dark.png" : "/logo-warm.png")),
  isDefaultImageFallback: vi.fn((src?: string) => Boolean(src?.includes("logo-"))),
  applyFallbackImageStyles: vi.fn(),
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
    vi.unstubAllGlobals()
    mockAuthState = {
      user: { id: "user_1" },
    }
    mockAddRecipeToCart.mockResolvedValue(undefined)
    mockIsFavorite.mockResolvedValue(false)
    mockToggleFavorite.mockResolvedValue(true)
    mockRecipeStatus = 200
    mockRecipePayload = {
      recipe: {
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
        ingredients: [
          {
            name: "Tomatoes",
            quantity: 2,
            unit: "cups",
            standardizedIngredientId: "std_1",
          },
        ],
      },
    }
    mockParams({ id: "recipe_1" })
    mockRouter()
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.toString()

      if (url.includes("/api/recipes/recipe_1/social")) {
        return new Response(
          JSON.stringify({
            likeCount: 0,
            isLiked: false,
            repostCount: 0,
            isReposted: false,
            friendLikes: [],
            friendProfileIds: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      if (url.includes("/api/recipes/recipe_1")) {
        return new Response(
          mockRecipePayload ? JSON.stringify(mockRecipePayload) : JSON.stringify({}),
          {
            status: mockRecipeStatus,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      throw new Error(`Unhandled fetch in RecipeDetailPage test: ${url}`)
    })

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

    await user.click(screen.getByTestId("recipe-basket-button-recipe_1"))
    expect(mockAddRecipeToCart).toHaveBeenCalledWith("recipe_1", 4)
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
    mockRecipeStatus = 404
    mockRecipePayload = null
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/recipes")
    })
  })
})
