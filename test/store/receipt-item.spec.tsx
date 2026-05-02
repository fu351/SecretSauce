import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReceiptItem } from "@/components/store/receipt-item"

describe("ReceiptItem package pricing", () => {
  it("scales estimate-only package pricing as quantity increases", () => {
    const { rerender } = render(
      <ReceiptItem
        item={{
          id: "item-1",
          user_id: "user-1",
          name: "2 lbs. chicken thighs",
          quantity: 1,
          unit: "piece",
          checked: false,
          source_type: "manual",
          recipe_id: null,
          recipe_ingredient_id: null,
          ingredient_id: "ing-1",
          category: "other",
          created_at: "2026-04-18T00:00:00.000Z",
          updated_at: "2026-04-18T00:00:00.000Z",
        }}
        pricing={{
          id: "store-item-1",
          title: "Foster Farms No Antibiotics Ever Chicken Thighs - 1.4-2.2lbs - price per lb",
          brand: "",
          price: 2.79,
          provider: "walmart",
          image_url: null,
          quantity: 3,
          shoppingItemId: "item-1",
          originalName: "2 lbs. chicken thighs",
          shoppingItemIds: ["item-1"],
          packagePrice: 2.79,
          convertedQuantity: null,
          conversionError: true,
          usedEstimate: true,
          packagesToBuy: 1,
        } as any}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        theme="light"
      />
    )

    expect(screen.getByText("Packages")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getAllByText("$2.79")).toHaveLength(2)
    expect(screen.getByRole("button", { name: /increase quantity for 2 lbs\. chicken thighs/i })).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /decrease quantity for 2 lbs\. chicken thighs/i })).toBeDisabled()

    rerender(
      <ReceiptItem
        item={{
          id: "item-1",
          user_id: "user-1",
          name: "2 lbs. chicken thighs",
          quantity: 3,
          unit: "piece",
          checked: false,
          source_type: "manual",
          recipe_id: null,
          recipe_ingredient_id: null,
          ingredient_id: "ing-1",
          category: "other",
          created_at: "2026-04-18T00:00:00.000Z",
          updated_at: "2026-04-18T00:00:00.000Z",
        }}
        pricing={{
          id: "store-item-1",
          title: "Foster Farms No Antibiotics Ever Chicken Thighs - 1.4-2.2lbs - price per lb",
          brand: "",
          price: 2.79,
          provider: "walmart",
          image_url: null,
          quantity: 1,
          shoppingItemId: "item-1",
          originalName: "2 lbs. chicken thighs",
          shoppingItemIds: ["item-1"],
          packagePrice: 2.79,
          convertedQuantity: null,
          conversionError: true,
          usedEstimate: true,
          packagesToBuy: 1,
        } as any}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        theme="light"
      />
    )

    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getAllByText("$8.37")).toHaveLength(2)
    expect(screen.getByRole("button", { name: /increase quantity for 2 lbs\. chicken thighs/i })).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /decrease quantity for 2 lbs\. chicken thighs/i })).not.toBeDisabled()
  })
})
