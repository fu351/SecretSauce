import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockFetchRecipes = vi.fn()
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockFetch = vi.fn()

let mockAuthState = {
  user: { id: "user_test_1", email: "friend@example.com", firstName: "Taylor" },
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

const mockFetchMealScheduleByDateRange = vi.fn()
const mockFindExpiringSoon = vi.fn()

vi.mock("@/lib/database/meal-planner-db", () => ({
  mealPlannerDB: {
    fetchMealScheduleByDateRange: mockFetchMealScheduleByDateRange,
  },
}))

vi.mock("@/lib/database/pantry-items-db", () => ({
  pantryItemsDB: {
    findExpiringSoon: mockFindExpiringSoon,
  },
}))

vi.mock("@/lib/database/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
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
    vi.unstubAllGlobals()
    mockAuthState = {
      user: { id: "user_test_1", email: "friend@example.com", firstName: "Taylor" },
      loading: false,
    }
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://cdn.test/post-image.png" },
    })
    vi.stubGlobal("fetch", mockFetch)
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:post-preview"),
    })
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.toString()

      if (url.includes("/api/posts/feed")) {
        return new Response(JSON.stringify({ posts: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (url.includes("/api/challenges/active")) {
        return new Response(
          JSON.stringify({
            challenge: {
              id: "challenge_1",
              title: "Midnight Pasta Challenge",
              description: "Share your favorite late-night bowl.",
              ends_at: "2099-01-02T00:00:00.000Z",
              points: 20,
              participant_count: 12,
            },
            entry: null,
            rank: 3,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      if (url.includes("/api/challenges/challenge_1/leaderboard")) {
        return new Response(
          JSON.stringify({
            leaders: [
              {
                profile_id: "leader_1",
                full_name: "Jordan Chef",
                username: "jordan-chef",
                total_points: 42,
                is_viewer: false,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      if (url.endsWith("/api/posts") && init?.method === "POST") {
        return new Response(JSON.stringify({ post: { id: "post_1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (url.includes("/api/search")) {
        return new Response(
          JSON.stringify({
            recipes: [{ id: "recipe_1", title: "Spicy Noodles" }],
            users: [{ id: "user_2", full_name: "Jordan Chef", username: "jordan-chef", avatar_url: null }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      if (url.includes("/api/challenges/challenge_1/join") && init?.method === "POST") {
        return new Response(JSON.stringify({ entry: { post_id: "post_1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      throw new Error(`Unhandled fetch in HomeReturningPage test: ${url}`)
    })

    mockFetchMealScheduleByDateRange.mockResolvedValue([])
    mockFindExpiringSoon.mockResolvedValue([])

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
      expect(screen.getAllByText("Top Rated Chili").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Fresh Gnocchi").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Roasted Peppers").length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText(/good evening/i).length).toBeGreaterThan(0)
    expect(
      screen.getByRole("heading", { name: /midnight pasta challenge/i })
    ).toBeInTheDocument()
    expect(screen.getByTestId("recipe-grid")).toBeInTheDocument()
  })

  it("opens the post-dish dialog and fires a success toast when submitted", async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /post your dish to enter/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /post your dish to enter/i }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /post your dish/i })).toBeInTheDocument()
    })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(fileInput).not.toBeNull()
    await user.upload(fileInput as HTMLInputElement, new File(["image"], "dish.png", { type: "image/png" }))

    expect(screen.getByLabelText(/dish name/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/dish name/i), "Late Night Pasta")
    await user.type(screen.getByLabelText(/caption/i), "Fast and comforting.")
    await user.click(screen.getByRole("button", { name: /^post$/i }))

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/posts",
        expect.objectContaining({ method: "POST" })
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Posted!" })
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

  it("hides social feed and challenge when not logged in", async () => {
    mockAuthState = { user: null as any, loading: false }
    render(<HomePage />)

    await waitFor(() => {
      expect(mockFetchRecipes).toHaveBeenCalled()
    })

    expect(screen.queryByRole("heading", { name: /made by your circle/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /midnight pasta challenge/i })).not.toBeInTheDocument()
    const signInLinks = screen.getAllByRole("link", { name: /^sign in$/i })
    expect(signInLinks.length).toBeGreaterThanOrEqual(1)
    expect(signInLinks.some((a) => a.getAttribute("href") === "/auth/signin")).toBe(true)

    const feedCalls = mockFetch.mock.calls.filter(([url]) =>
      typeof url === "string" && url.includes("/api/posts/feed")
    )
    expect(feedCalls.length).toBe(0)
  })

  it("opens full search overlay and preserves @username results", async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    const triggers = screen.getAllByRole("button", { name: /search recipes/i })
    await user.click(triggers[0])

    const overlay = screen.getByTestId("home-search-overlay")
    expect(overlay).toBeInTheDocument()
    const overlayInput = overlay.querySelector("input[placeholder='Search recipes or @username…']") as HTMLInputElement
    expect(overlayInput).toBeInTheDocument()
    await user.type(overlayInput, "@jordan")

    await waitFor(() => {
      expect(screen.getByText(/@jordan-chef/i)).toBeInTheDocument()
      expect(screen.getByText(/spicy noodles/i)).toBeInTheDocument()
    })

    expect(screen.getByRole("link", { name: /browse all recipes/i })).toBeInTheDocument()
  })
})
