import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

const mockStoreSelector = vi.fn()
vi.mock("@/components/store/store-selector", () => ({
  StoreSelector: (props: any) => {
    mockStoreSelector(props)
    return <div data-testid="store-selector" />
  },
}))

vi.mock("@/components/store/receipt-item", () => ({
  ReceiptItem: ({ item, pricing, onQuantityChange, onRemove }: any) => (
    <div data-testid="receipt-item">
      <span data-testid="item-name">{item.name}</span>
      <span data-testid="item-qty">{String(item.quantity)}</span>
      <span data-testid="item-id">{item.id}</span>
      <span data-testid="item-price">{pricing ? String(pricing.price) : "none"}</span>
      <button
        type="button"
        data-testid={`qty-${item.id}`}
        onClick={() => onQuantityChange(item.id, Number(item.quantity) + 1)}
      >
        qty
      </button>
      <button
        type="button"
        data-testid={`remove-${item.id}`}
        onClick={() => onRemove(item.id)}
      >
        remove
      </button>
    </div>
  ),
}))

import { ShoppingReceiptView } from "../shopping-receipt-view"

describe("ShoppingReceiptView", () => {
  it("merges like ingredients into one row", () => {
    render(
      <ShoppingReceiptView
        shoppingList={[
          {
            id: "item-a-1",
            name: "Apples",
            quantity: 2,
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
          },
          {
            id: "item-a-2",
            name: "Apples",
            quantity: 1,
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
          },
          {
            id: "item-b-1",
            name: "Bananas",
            quantity: 4,
            unit: "each",
            checked: false,
            servings: null,
            source_type: "manual",
            recipe_id: null,
            recipe_ingredient_id: null,
            ingredient_id: null,
            category: null,
            user_id: "user-1",
            created_at: "",
            updated_at: "",
          },
        ]}
        storeComparisons={[
          {
            store: "Walmart",
            groceryStoreId: "store-1",
            total: 5,
            savings: 0,
            missingItems: false,
            missingCount: 0,
            missingIngredients: [],
            items: [
              {
                id: "price-a",
                shoppingItemId: "item-a-1",
                shoppingItemIds: ["item-a-1", "item-a-2"],
                originalName: "Apples",
                title: "Apples",
                brand: "",
                price: 0.99,
                image_url: "",
                provider: "Walmart",
                category: "other",
                quantity: 3,
                unit: "each",
              },
              {
                id: "price-b",
                shoppingItemId: "item-b-1",
                shoppingItemIds: ["item-b-1"],
                originalName: "Bananas",
                title: "Bananas",
                brand: "",
                price: 0.5,
                image_url: "",
                provider: "Walmart",
                category: "other",
                quantity: 4,
                unit: "each",
              },
            ],
          },
        ]}
        selectedStore="Walmart"
        onStoreChange={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveItem={vi.fn()}
        theme="light"
      />
    )

    const rows = screen.getAllByTestId("receipt-item")
    expect(rows).toHaveLength(2)
    expect(screen.getByText("Apples")).toBeInTheDocument()
    expect(screen.getByText("Bananas")).toBeInTheDocument()
    expect(screen.getAllByTestId("item-qty")[0]).toHaveTextContent("3")
  })

  it("updates every source item when a merged row quantity changes", () => {
    const onQuantityChange = vi.fn()

    render(
      <ShoppingReceiptView
        shoppingList={[
          {
            id: "item-a-1",
            name: "Apples",
            quantity: 2,
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
          },
          {
            id: "item-a-2",
            name: "Apples",
            quantity: 1,
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
          },
        ]}
        storeComparisons={[
          {
            store: "Walmart",
            groceryStoreId: "store-1",
            total: 2.97,
            savings: 0,
            missingItems: false,
            missingCount: 0,
            missingIngredients: [],
            items: [
              {
                id: "price-a",
                shoppingItemId: "item-a-1",
                shoppingItemIds: ["item-a-1", "item-a-2"],
                originalName: "Apples",
                title: "Apples",
                brand: "",
                price: 0.99,
                image_url: "",
                provider: "Walmart",
                category: "other",
                quantity: 3,
                unit: "each",
              },
            ],
          },
        ]}
        selectedStore="Walmart"
        onStoreChange={vi.fn()}
        onQuantityChange={onQuantityChange}
        onRemoveItem={vi.fn()}
        theme="light"
      />
    )

    fireEvent.click(screen.getByTestId("qty-group:ingredient:std-apples"))

    expect(onQuantityChange).toHaveBeenCalledTimes(2)
    expect(onQuantityChange.mock.calls[0][0]).toBe("item-a-1")
    expect(onQuantityChange.mock.calls[0][1]).toBeCloseTo(3, 3)
    expect(onQuantityChange.mock.calls[1][0]).toBe("item-a-2")
    expect(onQuantityChange.mock.calls[1][1]).toBeCloseTo(1, 3)
  })

  it("removes every source item in a merged row", () => {
    const onRemoveItem = vi.fn()

    render(
      <ShoppingReceiptView
        shoppingList={[
          {
            id: "item-a-1",
            name: "Apples",
            quantity: 2,
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
          },
          {
            id: "item-a-2",
            name: "Apples",
            quantity: 1,
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
          },
        ]}
        storeComparisons={[]}
        selectedStore={null}
        onStoreChange={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveItem={onRemoveItem}
        theme="light"
      />
    )

    fireEvent.click(screen.getByTestId("remove-group:ingredient:std-apples"))

    expect(onRemoveItem).toHaveBeenCalledTimes(2)
    expect(onRemoveItem).toHaveBeenNthCalledWith(1, "item-a-1")
    expect(onRemoveItem).toHaveBeenNthCalledWith(2, "item-a-2")
  })
})
