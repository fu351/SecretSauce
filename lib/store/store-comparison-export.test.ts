import { describe, expect, it } from "vitest"
import { buildStoreComparisonExportPayload } from "./store-comparison-export"
import type { StoreComparison } from "@/lib/types/store"

describe("buildStoreComparisonExportPayload", () => {
  it("serializes store comparisons into a clipboard-friendly jsonb payload", () => {
    const comparisons: StoreComparison[] = [
      {
        store: "Target",
        total: 12.34,
        savings: 1.23,
        distanceMiles: 2.5,
        latitude: 37.78,
        longitude: -122.41,
        locationHint: "Target (94107)",
        missingItems: false,
        missingCount: 0,
        groceryStoreId: "gs-1",
        canonicalKey: "target",
        items: [
          {
            id: "item-1",
            shoppingItemId: "shopping-1",
            shoppingItemIds: ["shopping-1", "shopping-2"],
            originalName: "olive oil",
            title: "Olive Oil",
            brand: "",
            price: 6.17,
            image_url: "",
            provider: "Target",
            productMappingId: "pm-1",
            quantity: 2,
            packagesToBuy: 2,
            requestedUnit: "oz",
            productUnit: "oz",
            productQuantity: 16,
            convertedQuantity: 16,
            conversionError: false,
            usedEstimate: false,
            priceSource: "db",
            priceStoreId: "store-1",
            usedPriceBackup: false,
          },
        ],
        missingIngredients: [{ id: "ing-1", name: "salt" }],
      },
    ]

    const payload = buildStoreComparisonExportPayload(comparisons, 0)

    expect(payload).toMatchObject({
      kind: "store-comparison-jsonb",
      selected_store: "Target",
      selected_store_index: 0,
      store_count: 1,
      store_order: ["Target"],
      store_mapping: {
        Target: {
          store: "Target",
          canonical_key: "target",
          grocery_store_id: "gs-1",
          total: 12.34,
          savings: 1.23,
          distance_miles: 2.5,
          latitude: 37.78,
          longitude: -122.41,
          location_hint: "Target (94107)",
          missing_count: 0,
          missing_items: false,
          items: [
            {
              id: "item-1",
              shopping_item_id: "shopping-1",
              shopping_item_ids: ["shopping-1", "shopping-2"],
              original_name: "olive oil",
              title: "Olive Oil",
              product_mapping_id: "pm-1",
              price: 6.17,
              quantity: 2,
              packages_to_buy: 2,
              requested_unit: "oz",
              product_unit: "oz",
              product_quantity: 16,
              converted_quantity: 16,
              conversion_error: false,
              used_estimate: false,
              price_source: "db",
              price_store_id: "store-1",
              used_price_backup: false,
            },
          ],
          missing_ingredients: [{ id: "ing-1", name: "salt" }],
        },
      },
    })
  })
})
