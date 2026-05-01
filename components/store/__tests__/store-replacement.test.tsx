import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock("@/backend/orchestrators/frontend-scraper-pipeline/runner", () => ({
  searchGroceryStores: vi.fn().mockResolvedValue([]),
}))

const mockGetReplacement = vi.fn()
const mockPreviewStandardization = vi.fn()
const mockBatchStandardizeAndMatch = vi.fn()
const mockGetIngredientPriceDetails = vi.fn()
const mockIncrementCounts = vi.fn()

vi.mock("@/lib/database/ingredients-db", () => ({
  ingredientsHistoryDB: {
    previewStandardization: (...args: any[]) => mockPreviewStandardization(...args),
    batchStandardizeAndMatch: (...args: any[]) => mockBatchStandardizeAndMatch(...args),
    resolveStandardizedIngredientId: vi.fn(),
  },
  ingredientsRecentDB: {
    getReplacement: (...args: any[]) => mockGetReplacement(...args),
    getIngredientPriceDetails: (...args: any[]) => mockGetIngredientPriceDetails(...args),
  },
  normalizeStoreName: (store: string) => store.toLowerCase().replace(/\s+/g, ""),
}))

vi.mock("@/lib/database/product-mappings-db", () => ({
  productMappingsDB: {
    incrementCounts: (...args: any[]) => mockIncrementCounts(...args),
  },
}))

import { ItemReplacementModal } from "../store-replacement"

describe("ItemReplacementModal", () => {
  it("keeps all RPC replacement candidates after mapping enrichment", async () => {
    mockGetReplacement.mockResolvedValue([
      {
        ingredient_id: "ing-1",
        canonical_name: "Apples",
        category: "produce",
        offers: [
          { product_name: "Apple Brand A", price: 1.99, unit_price: 1.99, unit: "each", image_url: "https://example.com/a.png" },
        ],
      },
      {
        ingredient_id: "ing-2",
        canonical_name: "Bananas",
        category: "produce",
        offers: [
          { product_name: "Banana Brand B", price: 0.99, unit_price: 0.99, unit: "each", image_url: "https://example.com/b.png" },
        ],
      },
    ])
    mockPreviewStandardization.mockResolvedValue(new Map([
      ["Apple Brand A", "ing-1"],
      ["Banana Brand B", "ing-2"],
    ]))
    mockBatchStandardizeAndMatch.mockResolvedValue(2)
    mockGetIngredientPriceDetails
      .mockResolvedValueOnce([
        {
          store: "walmart",
          productMappingId: "pm-a",
          unitPrice: 1.99,
          packagePrice: 1.99,
          totalPrice: 1.99,
          packagesToBuy: 1,
          productName: "Apple Brand A",
          imageUrl: "https://example.com/a.png",
          distance: 1.2,
        },
      ])
      .mockResolvedValueOnce([
        {
          store: "walmart",
          productMappingId: "pm-b",
          unitPrice: 0.99,
          packagePrice: 0.99,
          totalPrice: 0.99,
          packagesToBuy: 1,
          productName: "Banana Brand B",
          imageUrl: "https://example.com/b.png",
          distance: 1.2,
        },
      ])
    mockIncrementCounts.mockResolvedValue("pm-fallback")

    const onSelect = vi.fn()

    render(
      <ItemReplacementModal
        isOpen
        onClose={vi.fn()}
        target={{
          term: "Fruit",
          store: "Walmart",
          standardizedIngredientId: "ing-1",
          groceryStoreId: "store-1",
        }}
        zipCode="94103"
        onSelect={onSelect}
        styles={{
          cardBgClass: "bg-white",
          textClass: "text-black",
          mutedTextClass: "text-gray-500",
          theme: "light",
        }}
        userId="user-1"
      />
    )

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Select" })).toHaveLength(2))
    expect(screen.getByText("Apple Brand A")).toBeInTheDocument()
    expect(screen.getByText("Banana Brand B")).toBeInTheDocument()
    expect(mockGetIngredientPriceDetails).toHaveBeenCalledWith("user-1", "ing-1")
    expect(mockGetIngredientPriceDetails).toHaveBeenCalledWith("user-1", "ing-2")

    await userEvent.click(screen.getAllByRole("button", { name: "Select" })[0])

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Apple Brand A",
        productMappingId: "pm-a",
      })
    )
  })
})
