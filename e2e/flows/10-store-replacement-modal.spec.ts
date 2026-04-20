/**
 * E2E tests: Store replacement modal
 *
 * Verifies the browser flow that opens the replacement modal from /store,
 * renders multiple replacement candidates, and closes after a selection.
 */

import { test, expect, type Page } from "@playwright/test"

const shoppingListItems = [
  {
    id: "item-fruit-1",
    user_id: "user-1",
    name: "Fruit",
    quantity: 1,
    unit: "each",
    checked: false,
    servings: null,
    source_type: "manual",
    recipe_title: null,
    recipe_id: null,
    recipe_ingredient_id: null,
    ingredient_id: "ing-1",
    standardizedIngredientId: "ing-1",
    standardizedName: "Fruit",
    category: "produce",
    created_at: "2026-04-18T00:00:00.000Z",
    updated_at: "2026-04-18T00:00:00.000Z",
  },
]

const pricingEntries = [
  {
    standardized_ingredient_id: "ing-1",
    total_amount: 1,
    requested_unit: "each",
    item_ids: ["item-fruit-1"],
    offers: [
      {
        store: "walmart",
        store_name: "Walmart",
        product_mapping_id: "pm-fruit",
        unit_price: 1.25,
        package_price: 1.25,
        total_price: 1.25,
        product_name: "Fruit",
        image_url: null,
        zip_code: "94103",
        distance: 1.2,
        product_unit: "each",
        product_quantity: 1,
        converted_quantity: 1,
        packages_to_buy: 1,
        conversion_error: false,
        used_estimate: false,
      },
    ],
  },
]

async function mockStorePageData(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 1, message: "Denied by test", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
        },
      },
      configurable: true,
    })
  })

  await page.route("**/rest/v1/profiles**", async (route) => {
    await route.fulfill({
      json: { zip_code: "94103" },
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rest/v1/shopping_list_items**", async (route) => {
    await route.fulfill({
      json: shoppingListItems,
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rpc/get_pricing_gaps", async (route) => {
    await route.fulfill({
      json: [],
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rpc/get_pricing", async (route) => {
    await route.fulfill({
      json: pricingEntries,
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/api/user-store-metadata**", async (route) => {
    await route.fulfill({
      json: {
        metadata: [
          {
            storeName: "walmart",
            storeId: "store-1",
            grocery_store_id: "store-1",
            zipCode: "94103",
            latitude: 37.7749,
            longitude: -122.4194,
            distanceMiles: 1.2,
          },
        ],
      },
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/api/auth/ensure-profile**", async (route) => {
    await route.fulfill({
      json: {
        profile: {
          id: "user-1",
          email: "test@example.com",
          created_at: "2026-04-18T00:00:00.000Z",
        },
      },
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rpc/get_replacement", async (route) => {
    await route.fulfill({
      json: [
        {
          replacement_results: [
            {
              ingredient_id: "ing-1",
              canonical_name: "Fruit",
              category: "produce",
              offers: [
                {
                  product_name: "Fruit",
                  price: 1.25,
                  unit_price: 1.25,
                  quantity: 1,
                  unit: "each",
                  image_url: null,
                  is_standard_unit: true,
                },
              ],
            },
            {
              ingredient_id: "ing-2",
              canonical_name: "Fruit Snacks",
              category: "produce",
              offers: [
                {
                  product_name: "Fruit Snacks",
                  price: 2.5,
                  unit_price: 2.5,
                  quantity: 1,
                  unit: "each",
                  image_url: null,
                  is_standard_unit: true,
                },
              ],
            },
          ],
        },
      ],
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rpc/fn_bulk_insert_ingredient_history", async (route) => {
    await route.fulfill({
      json: [1, 2],
      headers: { "content-type": "application/json" },
    })
  })

  await page.route("**/rpc/get_ingredient_price_details", async (route) => {
    await route.fulfill({
      json: [
        {
          offers: [
            {
              store: "walmart",
              product_mapping_id: "pm-fruit",
              unit_price: 1.25,
              package_price: 1.25,
              total_price: 1.25,
              packages_to_buy: 1,
              product_name: "Fruit",
              image_url: null,
              distance: 1.2,
            },
            {
              store: "walmart",
              product_mapping_id: "pm-fruit-snacks",
              unit_price: 2.5,
              package_price: 2.5,
              total_price: 2.5,
              packages_to_buy: 1,
              product_name: "Fruit Snacks",
              image_url: null,
              distance: 1.2,
            },
          ],
        },
      ],
      headers: { "content-type": "application/json" },
    })
  })
}

test.describe("Store replacement modal", () => {
  test.beforeEach(async ({ page }) => {
    await mockStorePageData(page)
    await page.goto("/store")
  })

  test("renders multiple candidates and closes after selection", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole("button", { name: /replace/i }).click()

    await expect(page.getByLabel("Search replacements")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("heading", { name: "Replace: Fruit" })).toBeVisible()
    await expect(page.getByText("Fruit Snacks", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Select" })).toHaveCount(2)

    await page.getByRole("button", { name: "Select" }).nth(1).click()

    await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator("p").filter({ hasText: /^Fruit Snacks$/ })).toHaveCount(1, { timeout: 15_000 })
  })
})
