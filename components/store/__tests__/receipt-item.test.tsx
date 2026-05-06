import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { ReceiptItem } from "../receipt-item"

describe("ReceiptItem package calculations", () => {
  it("uses package pricing when package metadata is present", () => {
    render(
      <ReceiptItem
        item={{
          id: "item-1",
          name: "Apples",
          quantity: 3,
          unit: "each",
          checked: false,
          servings: null,
          source_type: "manual",
          recipe_id: null,
          recipe_ingredient_id: null,
          ingredient_id: "std-apples",
          category: null,
          user_id: "user-1",
          created_at: "",
          updated_at: "",
        }}
        pricing={{
          id: "price-1",
          title: "Apples",
          brand: "",
          price: 0.99,
          image_url: "",
          provider: "Walmart",
          category: "other",
          quantity: 1,
          shoppingItemId: "item-1",
          originalName: "Apples",
          packagesToBuy: 2,
          packagePrice: 0.99,
          shoppingItemIds: ["item-1"],
          productMappingId: "pm-1",
          requestedUnit: "each",
          productUnit: "each",
          productQuantity: 1,
          convertedQuantity: 3,
          conversionError: false,
          usedEstimate: false,
        }}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        theme="light"
      />
    )

    expect(screen.getAllByText("$0.99").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /expand item details/i }))
    expect(screen.getByText("Buy at store")).toBeInTheDocument()
    expect(screen.getByText("1 package")).toBeInTheDocument()
    expect(screen.getByText("Package price")).toBeInTheDocument()
    expect(screen.getAllByText("$0.99").length).toBeGreaterThanOrEqual(2)
  })

  it("falls back to simple price math when package metadata is absent", () => {
    render(
      <ReceiptItem
        item={{
          id: "item-2",
          name: "Bananas",
          quantity: 4,
          unit: "each",
          checked: false,
          servings: null,
          source_type: "manual",
          recipe_id: null,
          recipe_ingredient_id: null,
          ingredient_id: "std-bananas",
          category: null,
          user_id: "user-1",
          created_at: "",
          updated_at: "",
        }}
        pricing={{
          id: "price-2",
          title: "Bananas",
          brand: "",
          price: 0.5,
          image_url: "",
          provider: "Walmart",
          category: "other",
          quantity: 1,
          shoppingItemId: "item-2",
          originalName: "Bananas",
          shoppingItemIds: ["item-2"],
          productMappingId: "pm-2",
          requestedUnit: "each",
          productUnit: "each",
          productQuantity: 1,
          convertedQuantity: 4,
          conversionError: false,
          usedEstimate: false,
        }}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        theme="light"
      />
    )

    expect(screen.getAllByText("$2.00").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /expand item details/i }))
    expect(screen.getByText("Cart quantity")).toBeInTheDocument()
    expect(screen.getAllByText("4 each")).toHaveLength(2)
  })

  it("shows 0 packages when the item is unavailable at the store", () => {
    render(
      <ReceiptItem
        item={{
          id: "item-3",
          name: "Olive Oil",
          quantity: 2,
          unit: "each",
          checked: false,
          servings: null,
          source_type: "manual",
          recipe_id: null,
          recipe_ingredient_id: null,
          ingredient_id: "std-olive-oil",
          category: null,
          user_id: "user-1",
          created_at: "",
          updated_at: "",
        }}
        pricing={null}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        theme="light"
      />
    )

    expect(screen.getByText("0")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /expand item details/i }))
    expect(screen.getByText("Buy at store")).toBeInTheDocument()
    expect(screen.getByText("0 packages")).toBeInTheDocument()
    expect(screen.getAllByText("Not available at this store")).toHaveLength(2)
  })
})
