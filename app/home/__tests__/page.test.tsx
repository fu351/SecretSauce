import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { server } from "@/test/mocks/server"

const mockToast = vi.fn()
const mockFetchRecipes = vi.fn()
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()

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

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipes: mockFetchRecipes,
  },
}))

vi.mock("@/components/recipe/cards/recipe-card-compact", () => ({
  RecipeCardCompact: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-root">{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
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

    if ("createObjectURL" in URL) {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-image")
    } else {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn(() => "blob:mock-image"),
      })
    }

    server.use(
      http.get("/api/posts/feed", () => HttpResponse.json({ posts: [] })),
      http.get("/api/challenges/active", () => HttpResponse.json({ challenge: null })),
      http.post("/api/posts", async () =>
        HttpResponse.json({
          post: { id: "post_1" },
        })
      )
    )
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/dish.png" } })

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

    expect(screen.getAllByText(/good evening/i)).toHaveLength(2)
    expect(screen.getByRole("heading", { name: /flavors of the week/i })).toBeInTheDocument()
    expect(screen.getByTestId("recipe-grid")).toBeInTheDocument()
  })

  it("opens the post-dish dialog and fires a success toast when submitted", async () => {
    render(<HomePage />)

    const user = userEvent.setup()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const imageFile = new File(["fake image"], "dish.png", { type: "image/png" })
    fireEvent.change(fileInput, { target: { files: [imageFile] } })
    await user.type(await screen.findByLabelText(/dish name/i), "Late Night Pasta")
    await user.type(screen.getByLabelText(/caption/i), "Fast and comforting.")
    await user.click(screen.getByRole("button", { name: /^post$/i }))

    await waitFor(() => {
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
})
