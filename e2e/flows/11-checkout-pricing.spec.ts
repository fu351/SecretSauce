/**
 * E2E tests: Checkout pricing
 *
 * Verifies the /store -> /checkout handoff preserves pricing data and that the
 * checkout page POSTs the expected summary to /api/checkout.
 *
 * The tax-inclusive pricing assertion is intentionally marked fixme because the
 * backend does not yet apply the flat fee + basket tax adjustment.
 */

import { test, expect, type Page } from "@playwright/test"

const shoppingListItems = [
  {
    id: "item-1",
    user_id: "user-1",
    name: "Apples",
    quantity: 2,
    unit: "each",
    checked: false,
    servings: null,
    source_type: "manual",
    recipe_title: null,
    recipe_id: null,
    recipe_ingredient_id: null,
    ingredient_id: "ing-apples",
    standardizedIngredientId: "ing-apples",
    standardizedName: "Apples",
    category: "produce",
    created_at: "2026-04-18T00:00:00.000Z",
    updated_at: "2026-04-18T00:00:00.000Z",
  },
]

const pricingEntries = [
  {
    standardized_ingredient_id: "ing-apples",
    total_amount: 2,
    requested_unit: "each",
    item_ids: ["item-1"],
    offers: [
      {
        store: "walmart",
        store_name: "Walmart",
        product_mapping_id: "pm-apples",
        unit_price: 1.25,
        package_price: 1.25,
        total_price: 2.50,
        product_name: "Apples",
        image_url: null,
        zip_code: "94103",
        distance: 1.2,
        product_unit: "each",
        product_quantity: 1,
        converted_quantity: 2,
        packages_to_buy: 2,
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
}

test.describe("Checkout pricing", () => {
  test.beforeEach(async ({ page }) => {
    await mockStorePageData(page)
    await page.goto("/store")
  })

  test("keeps the store total intact through checkout submission", async ({ page }) => {
    const checkoutRequests: Array<Record<string, unknown>> = []

    await page.route("**/api/checkout", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      checkoutRequests.push(body)
      await route.fulfill({
        json: { url: "https://checkout.stripe.com/session_test" },
        headers: { "content-type": "application/json" },
      })
    })

    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: /proceed to checkout/i }).click()
    await expect(page).toHaveURL(/\/checkout\?/)

    await expect(page.getByRole("heading", { name: /upgrade to premium/i })).toBeVisible()
    await expect(page.getByText(/total:\s*\$2\.50/i)).toBeVisible()

    await page.getByRole("button", { name: /proceed to payment/i }).click()
    await expect(page).toHaveURL("https://checkout.stripe.com/session_test")

    expect(checkoutRequests).toHaveLength(1)
    expect(checkoutRequests[0]).toMatchObject({
      totalAmount: 2.5,
      itemCount: 1,
      cartItems: [
        {
          item_id: "item-1",
          product_id: "pm-apples",
          num_pkgs: 2,
          frontend_price: 1.25,
        },
      ],
    })
  })

  test.fixme("applies the flat fee and basket tax to the checked out total", async ({ page }) => {
    await page.route("**/api/checkout", async (route) => {
      await route.fulfill({
        json: { url: "https://checkout.stripe.com/session_test" },
        headers: { "content-type": "application/json" },
      })
    })

    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole("button", { name: /proceed to checkout/i }).click()
    await expect(page).toHaveURL(/\/checkout\?/)

    // Replace these values with the final backend pricing formula once the tax
    // and flat fee logic is live.
    await expect(page.getByText(/total:\s*\$2\.50/i)).toBeVisible()
    await page.getByRole("button", { name: /proceed to payment/i }).click()
  })
})
