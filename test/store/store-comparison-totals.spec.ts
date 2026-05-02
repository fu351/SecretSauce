import { describe, expect, it } from "vitest"
import { buildQuantityMap, calculateStoreComparisonTotals } from "@/lib/store/store-comparison-totals"

describe("store comparison totals", () => {
  it("recomputes totals from the current shopping list quantities", () => {
    const quantityMap = buildQuantityMap([
      { id: "item-1", quantity: 3 },
      { id: "item-2", quantity: 1 },
    ])

    const comparisons = calculateStoreComparisonTotals(
      [
        {
          store: "walmart",
          items: [
            {
              id: "walmart-item-1",
              title: "Apples",
              brand: "",
              price: 1,
              provider: "walmart",
              image_url: null,
              quantity: 1,
              shoppingItemId: "item-1",
              originalName: "Apples",
              shoppingItemIds: ["item-1"],
            },
            {
              id: "walmart-item-2",
              title: "Bananas",
              brand: "",
              price: 2,
              provider: "walmart",
              image_url: null,
              quantity: 1,
              shoppingItemId: "item-2",
              originalName: "Bananas",
              shoppingItemIds: ["item-2"],
            },
          ],
          total: 3,
          savings: 0,
        },
        {
          store: "target",
          items: [
            {
              id: "target-item-1",
              title: "Apples",
              brand: "",
              price: 2,
              provider: "target",
              image_url: null,
              quantity: 1,
              shoppingItemId: "item-1",
              originalName: "Apples",
              shoppingItemIds: ["item-1"],
            },
          ],
          total: 2,
          savings: 0,
        },
      ],
      quantityMap
    )

    expect(comparisons[0].total).toBe(5)
    expect(comparisons[1].total).toBe(6)
    expect(comparisons[0].savings).toBe(1)
    expect(comparisons[1].savings).toBe(0)
  })
})
