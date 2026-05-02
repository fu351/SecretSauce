import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    findById: mocks.findById,
  },
}))

import { ShoppingListSection } from "@/components/store/store-list"

describe("ShoppingListSection", () => {
  beforeEach(() => {
    mocks.findById.mockResolvedValue({ id: "recipe-1", title: "Test Recipe" })
  })

  it("only shows the recipe delete action for recipe groups", async () => {
    const user = userEvent.setup()
    const onRemoveRecipe = vi.fn()

    render(
      <ShoppingListSection
        shoppingList={[
          {
            id: "item-1",
            user_id: "user-1",
            name: "Tomatoes",
            quantity: 2,
            unit: "piece",
            checked: false,
            source_type: "recipe",
            recipe_id: "recipe-1",
            recipe_ingredient_id: "ing-1",
            servings: 2,
            ingredient_id: "std-tomatoes",
            category: "produce",
            created_at: "2026-04-18T00:00:00.000Z",
            updated_at: "2026-04-18T00:00:00.000Z",
          },
        ]}
        onRemoveItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        onUpdateItemName={vi.fn()}
        onToggleItem={vi.fn()}
        onAddItem={vi.fn()}
        onAddRecipe={vi.fn()}
        onRemoveRecipe={onRemoveRecipe}
        cardBgClass="bg-white"
        textClass="text-gray-900"
        mutedTextClass="text-gray-500"
        buttonClass="bg-black"
        buttonOutlineClass="border"
        theme="light"
      />
    )

    await user.click(screen.getByTitle("Group by Category"))

    await waitFor(() => {
      expect(screen.getByText("Produce")).toBeInTheDocument()
      expect(screen.queryByTitle("Remove entire recipe")).not.toBeInTheDocument()
    })

    await user.click(screen.getByTitle("Group by Recipe"))
    await user.click(screen.getByTitle("Remove entire recipe"))

    expect(onRemoveRecipe).toHaveBeenCalledWith("recipe-1")
  })
})
