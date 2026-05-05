import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useParams, useRouter } from "next/navigation"

const mockToast = vi.fn()
const mockUseRecipe = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockUpsertRecipeWithIngredients = vi.fn()
const mockDeleteRecipe = vi.fn()
const mockUploadRecipeImage = vi.fn()
const mockFetch = vi.fn()

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
  useRecipe: (...args: any[]) => mockUseRecipe(...args),
}))

vi.mock("@/hooks/use-admin", () => ({
  useIsAdmin: () => false,
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    upsertRecipeWithIngredients: mockUpsertRecipeWithIngredients,
    deleteRecipe: mockDeleteRecipe,
  },
}))

vi.mock("@/lib/image-helper", () => ({
  uploadRecipeImage: mockUploadRecipeImage,
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock("@/components/recipe/import/recipe-import-paragraph", () => ({
  RecipeImportParagraph: ({ onImportSuccess }: { onImportSuccess: (recipe: any) => void }) => (
    <button
      type="button"
      onClick={() => onImportSuccess({ ingredients: [{ name: "Mushrooms" }] })}
    >
      Import Ingredients
    </button>
  ),
}))

vi.mock("@/components/recipe/forms/recipe-manual-entry-form", () => ({
  RecipeManualEntryForm: ({
    onSubmit,
    onDelete,
    initialData,
  }: {
    onSubmit: (data: any) => Promise<void>
    onDelete: () => Promise<void>
    initialData?: { title?: string }
  }) => (
    <div>
      <div data-testid="edit-initial-title">{initialData?.title ?? "empty"}</div>
      <button
        type="button"
        onClick={() =>
          onSubmit({
            title: "Updated Pasta",
            description: "Even better",
            image_url: null,
            imageFile: new File(["image"], "dish.png", { type: "image/png" }),
            prep_time: 15,
            cook_time: 25,
            servings: 3,
            difficulty: "intermediate",
            cuisine: "italian",
            tags: ["comfort"],
            ingredients: [{ name: "Pasta" }],
            instructions: [{ description: "Cook" }, { description: "Serve" }],
            nutrition: { calories: 500 },
          })
        }
      >
        Submit Edit
      </button>
      <button type="button" onClick={onDelete}>
        Delete Recipe
      </button>
    </div>
  ),
}))

describe("EditRecipePage", () => {
  let EditRecipePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: { id: "user_1" },
    }
    vi.mocked(useParams).mockReturnValue({ id: "recipe_1" } as any)
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)
    mockUseRecipe.mockReturnValue({
      data: {
        id: "recipe_1",
        title: "Original Pasta",
        author_id: "user_1",
        cuisine_name: "italian",
        meal_type: null,
        protein: null,
        prep_time: 10,
        cook_time: 20,
        servings: 2,
        difficulty: "beginner",
        description: "Original",
        image_url: null,
        tags: [],
        ingredients: [],
        instructions_list: [],
        nutrition: null,
      },
      isLoading: false,
    })
    mockUploadRecipeImage.mockResolvedValue("uploaded/edit.png")
    mockUpsertRecipeWithIngredients.mockResolvedValue({ id: "recipe_1" })
    mockDeleteRecipe.mockResolvedValue(undefined)
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/recipes/recipe_1") && init?.method === "PATCH") {
        return Promise.resolve(Response.json({ recipe: { id: "recipe_1" } }))
      }
      if (url.includes("/api/recipes/recipe_1") && init?.method === "DELETE") {
        return Promise.resolve(Response.json({ success: true }))
      }
      return Promise.resolve(Response.json({ isAdmin: false }))
    })
    vi.stubGlobal("fetch", mockFetch)

    const mod = await import("../page")
    EditRecipePage = mod.default
  })

  it("redirects away when the current user does not own the recipe", async () => {
    mockUseRecipe.mockReturnValue({
      data: {
        id: "recipe_1",
        title: "Original Pasta",
        author_id: "different_user",
        ingredients: [],
        instructions_list: [],
      },
      isLoading: false,
    })
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Permission denied" })
      )
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/recipes?mine=true")
    })
  })

  it("submits edits, invalidates queries, and routes back to the recipe detail page", async () => {
    const user = userEvent.setup()
    render(<EditRecipePage />)

    await user.click(screen.getByRole("button", { name: /submit edit/i }))

    await waitFor(() => {
      expect(mockUploadRecipeImage).toHaveBeenCalledWith(expect.any(File), "user_1")
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/recipes/recipe_1",
        expect.objectContaining({
          method: "PATCH",
          credentials: "include",
        })
      )
      expect(JSON.parse(mockFetch.mock.calls.find(([url, init]) =>
        String(url).includes("/api/recipes/recipe_1") && init?.method === "PATCH"
      )?.[1]?.body as string)).toMatchObject({
        title: "Updated Pasta",
        imageUrl: "uploaded/edit.png",
        instructions: ["Cook", "Serve"],
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recipe", "recipe_1"] })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recipes"] })
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/recipes/recipe_1")
    })
  })

  it("deletes the recipe and routes back to the user's recipes", async () => {
    const user = userEvent.setup()
    render(<EditRecipePage />)

    await user.click(screen.getByRole("button", { name: /delete recipe/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/recipes/recipe_1",
        expect.objectContaining({
          method: "DELETE",
          credentials: "include",
        })
      )
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recipes"] })
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/recipes?mine=true")
    })
  })
})
