import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockFetchRecipes = vi.fn()

let mockAuthState = {
  user: { email: "friend@example.com", firstName: "Taylor" },
  loading: false,
}

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipes: mockFetchRecipes,
  },
}))

vi.mock("@/components/recipe/cards/recipe-card-compact", () => ({
  RecipeCardCompact: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/recipe/recipe-grid", () => ({
  RecipeGrid: ({ recipes }: { recipes: Array<{ title: string }> }) => (
    <div data-testid="recipe-grid">
      {recipes.map((recipe) => (
        <div key={recipe.title}>{recipe.title}</div>
      ))}
    </div>
  ),
}))

describe("HomeReturningPage", () => {
  let HomePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { email: "friend@example.com", firstName: "Taylor" },
      loading: false,
    }

    mockFetchRecipes
      .mockResolvedValueOnce([
        {
          id: "top-1",
          title: "Top Rated Chili",
          content: "",
          difficulty: "beginner",
          rating_avg: 5,
          rating_count: 10,
          tags: [],
          nutrition: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "new-1",
          title: "Fresh Gnocchi",
          content: "",
          difficulty: "intermediate",
          rating_avg: 4.2,
          rating_count: 4,
          tags: [],
          nutrition: null,
        },
        {
          id: "new-2",
          title: "Roasted Peppers",
          content: "",
          difficulty: "beginner",
          rating_avg: 4.5,
          rating_count: 6,
          tags: [],
          nutrition: null,
        },
      ])

    const mod = await import("../page")
    HomePage = mod.default
  })

  it("loads both recipe feeds and renders featured content", async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(mockFetchRecipes).toHaveBeenNthCalledWith(1, { sortBy: "rating_avg", limit: 10 })
      expect(mockFetchRecipes).toHaveBeenNthCalledWith(2, { sortBy: "created_at", limit: 24 })
      expect(screen.getByText("Top Rated Chili")).toBeInTheDocument()
      expect(screen.getByText("Fresh Gnocchi")).toBeInTheDocument()
      expect(screen.getByText("Roasted Peppers")).toBeInTheDocument()
    })

    expect(screen.getByText(/good evening/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /pantry rescue/i })).toBeInTheDocument()
    expect(screen.getByTestId("recipe-grid")).toBeInTheDocument()
  })

  it("opens the post-dish dialog and fires a success toast when submitted", async () => {
    render(<HomePage />)

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /post your dish/i }))
    await user.type(screen.getByLabelText(/dish name/i), "Late Night Pasta")
    await user.type(screen.getByLabelText(/caption/i), "Fast and comforting.")
    await user.click(screen.getByRole("button", { name: /^post$/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Posted (placeholder)" })
      )
    })
  })

  it("renders the empty recommendations state when no recent recipes are returned", async () => {
    mockFetchRecipes.mockReset()
    mockFetchRecipes.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/no recommendations yet/i)).toBeInTheDocument()
    })
  })
})
