import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRouter, useSearchParams } from "next/navigation"

const mockToast = vi.fn()
const mockUpsertRecipeWithIngredients = vi.fn()
const mockUploadRecipeImage = vi.fn()

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
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    upsertRecipeWithIngredients: mockUpsertRecipeWithIngredients,
  },
}))

vi.mock("@/lib/image-helper", () => ({
  uploadRecipeImage: mockUploadRecipeImage,
}))

vi.mock("@/components/recipe/import/recipe-import-paragraph", () => ({
  RecipeImportParagraph: () => <div data-testid="recipe-import-paragraph">Paragraph Import</div>,
}))

vi.mock("@/components/recipe/forms/recipe-manual-entry-form", () => ({
  RecipeManualEntryForm: ({
    onSubmit,
    initialData,
  }: {
    onSubmit: (data: any) => Promise<void>
    initialData?: { title?: string }
  }) => (
    <div>
      <div data-testid="manual-initial-title">{initialData?.title ?? "empty"}</div>
      <button
        type="button"
        onClick={() =>
          onSubmit({
            title: "Manual Pasta",
            description: "Comfort food",
            image_url: null,
            imageFile: new File(["image"], "dish.png", { type: "image/png" }),
            prep_time: 10,
            cook_time: 20,
            servings: 2,
            difficulty: "beginner",
            cuisine: "italian",
            tags: ["comfort"],
            ingredients: [{ name: "Pasta" }],
            instructions: [{ description: "Boil water" }, { description: "Serve" }],
            nutrition: { calories: 400 },
          })
        }
      >
        Submit Manual Recipe
      </button>
    </div>
  ),
}))

vi.mock("@/components/recipe/import/recipe-import-tabs", () => ({
  RecipeImportTabs: ({
    onImportSuccess,
    initialImportTab,
  }: {
    onImportSuccess: (recipe: any) => void
    initialImportTab?: string
  }) => (
    <div>
      <div data-testid="initial-import-tab">{initialImportTab ?? "none"}</div>
      <button
        type="button"
        onClick={() =>
          onImportSuccess({
            title: "Imported Ramen",
            description: "Fast dinner",
            ingredients: [{ name: "Noodles" }],
            instructions: [{ description: "Cook noodles" }],
          })
        }
      >
        Import Recipe
      </button>
    </div>
  ),
}))

describe("UploadRecipePage", () => {
  let UploadRecipePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { id: "user_1" },
    }
    mockUploadRecipeImage.mockResolvedValue("uploaded/image.png")
    mockUpsertRecipeWithIngredients.mockResolvedValue({ id: "recipe_1" })
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)

    const mod = await import("../page")
    UploadRecipePage = mod.default
  })

  it("starts on the instagram import tab when opened from a shared link", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("import=instagram&url=https://instagram.com/p/abc") as any
    )
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(screen.getByTestId("initial-import-tab")).toHaveTextContent("instagram")
    })
  })

  it("moves imported recipe data into the manual form", async () => {
    const user = userEvent.setup()
    render(<UploadRecipePage />)

    await user.click(screen.getByRole("tab", { name: /import recipe/i }))
    await user.click(screen.getByRole("button", { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByTestId("manual-initial-title")).toHaveTextContent("Imported Ramen")
    })
  })

  it("uploads the recipe image, saves the recipe, and routes to the new recipe", async () => {
    const user = userEvent.setup()
    render(<UploadRecipePage />)

    await user.click(screen.getByRole("button", { name: /submit manual recipe/i }))

    await waitFor(() => {
      expect(mockUploadRecipeImage).toHaveBeenCalledWith(expect.any(File), "user_1")
      expect(mockUpsertRecipeWithIngredients).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Manual Pasta",
          authorId: "user_1",
          imageUrl: "uploaded/image.png",
          instructions: ["Boil water", "Serve"],
        })
      )
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/recipes/recipe_1")
    })
  })

  it("shows an auth error toast when the user is missing", async () => {
    const user = userEvent.setup()
    mockAuthState = { user: null }
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)
    await user.click(screen.getByRole("button", { name: /submit manual recipe/i }))

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Authentication required",
        variant: "destructive",
      })
    )
  })
})
