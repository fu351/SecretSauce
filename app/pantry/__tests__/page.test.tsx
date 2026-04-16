import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockFindByUserId = vi.fn()
const mockCreatePantryItem = vi.fn()
const mockUpdatePantryItem = vi.fn()
const mockRemovePantryItem = vi.fn()
const mockDeleteByUserId = vi.fn()
const mockFetchRecipes = vi.fn()

const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(today.getDate() + 1)
const expiresTodayForLocalTimezone = tomorrow.toISOString().split("T")[0]

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user_1" },
  })),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/lib/database/pantry-items-db", () => ({
  pantryItemsDB: {
    findByUserId: mockFindByUserId,
    create: mockCreatePantryItem,
    update: mockUpdatePantryItem,
    remove: mockRemovePantryItem,
    deleteByUserId: mockDeleteByUserId,
  },
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipes: mockFetchRecipes,
  },
}))

describe("PantryPage", () => {
  let PantryPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFindByUserId.mockResolvedValue([])
    mockFetchRecipes.mockResolvedValue([])
    mockUpdatePantryItem.mockResolvedValue(true)
    mockRemovePantryItem.mockResolvedValue(true)

    const mod = await import("../page")
    PantryPage = mod.default
  })

  it("shows the empty pantry state when the user has no saved items", async () => {
    render(<PantryPage />)

    await waitFor(() => {
      expect(screen.getByText(/your pantry is empty/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /add your first item/i })).toBeInTheDocument()
    })
  })

  it("renders expiring items and recipe suggestions, then removes an item from the pantry", async () => {
    mockFindByUserId.mockResolvedValue([
      {
        id: "item_1",
        name: "Milk",
        quantity: 1,
        unit: "carton",
        category: "Dairy",
        expiry_date: expiresTodayForLocalTimezone,
        standardized_ingredient_id: "std_milk",
        standardized_name: "Milk",
      },
      {
        id: "item_2",
        name: "Rice",
        quantity: 2,
        unit: "bags",
        category: "Grains",
        expiry_date: null,
        standardized_ingredient_id: null,
        standardized_name: null,
      },
    ])

    mockFetchRecipes.mockResolvedValue([
      {
        id: "recipe_1",
        title: "Creamy Rice Pudding",
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        content: { image_url: "/rice-pudding.jpg" },
        ingredients: [{ name: "Milk", standardizedIngredientId: "std_milk" }],
      },
    ])

    const mod = await import("../page")
    const Page = mod.default
    const user = userEvent.setup()

    render(<Page />)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Items expiring today")
      expect(screen.getByText(/creamy rice pudding/i)).toBeInTheDocument()
      expect(screen.getByText(/100% match/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /expiring soon/i }))

    expect(screen.getAllByText("Milk").length).toBeGreaterThan(0)
    expect(screen.queryByText("Rice")).not.toBeInTheDocument()

    const removeButtons = screen.getAllByRole("button", { name: /remove/i })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(mockRemovePantryItem).toHaveBeenCalledWith("item_1")
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Item removed",
        })
      )
    })
  })
})
