/**
 * E2E tests: Store page merged ingredient rendering
 *
 * This spec runs with the authenticated Playwright storage state and stubs the
 * minimum Supabase/API traffic needed for the store page to render a non-empty
 * shopping list. The goal is to verify that the browser UI merges duplicate
 * ingredients into a single row and keeps checkout totals aligned with the
 * merged view.
 */

import { test, expect, type Page } from "@playwright/test"

test.use({ storageState: undefined })

const shoppingListItems = [
  {
    id: "item-apple-1",
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
    ingredient_id: "std-apples",
    category: "produce",
    created_at: "2026-04-18T00:00:00.000Z",
    updated_at: "2026-04-18T00:00:00.000Z",
  },
  {
    id: "item-apple-2",
    user_id: "user-1",
    name: "Apples",
    quantity: 1,
    unit: "each",
    checked: false,
    servings: null,
    source_type: "manual",
    recipe_title: null,
    recipe_id: null,
    recipe_ingredient_id: null,
    ingredient_id: "std-apples",
    category: "produce",
    created_at: "2026-04-18T00:01:00.000Z",
    updated_at: "2026-04-18T00:01:00.000Z",
  },
  {
    id: "item-bananas-1",
    user_id: "user-1",
    name: "Bananas",
    quantity: 4,
    unit: "each",
    checked: false,
    servings: null,
    source_type: "manual",
    recipe_title: null,
    recipe_id: null,
    recipe_ingredient_id: null,
    ingredient_id: "std-bananas",
    category: "produce",
    created_at: "2026-04-18T00:02:00.000Z",
    updated_at: "2026-04-18T00:02:00.000Z",
  },
]

const pricingEntries = [
  {
    standardized_ingredient_id: "std-apples",
    total_amount: 3,
    requested_unit: "each",
    item_ids: ["item-apple-1", "item-apple-2"],
    offers: [
      {
        store: "walmart",
        store_name: "Walmart",
        product_mapping_id: "pm-apples",
        unit_price: 1,
        package_price: 1,
        total_price: 3,
        product_name: "Apples",
        image_url: null,
        zip_code: "94103",
        distance: 1.2,
        product_unit: "each",
        product_quantity: 1,
        converted_quantity: 3,
        packages_to_buy: 3,
        conversion_error: false,
        used_estimate: false,
      },
    ],
  },
  {
    standardized_ingredient_id: "std-bananas",
    total_amount: 4,
    requested_unit: "each",
    item_ids: ["item-bananas-1"],
    offers: [
      {
        store: "walmart",
        store_name: "Walmart",
        product_mapping_id: "pm-bananas",
        unit_price: 0.5,
        package_price: 0.5,
        total_price: 2,
        product_name: "Bananas",
        image_url: null,
        zip_code: "94103",
        distance: 1.2,
        product_unit: "each",
        product_quantity: 1,
        converted_quantity: 4,
        packages_to_buy: 4,
        conversion_error: false,
        used_estimate: false,
      },
    ],
  },
]

async function mockStorePageData(page: Page) {
  let currentShoppingListItems = [...shoppingListItems]

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
      headers: {
        "content-type": "application/json",
      },
    })
  })

  await page.route("**/rest/v1/shopping_list_items**", async (route) => {
    if (route.request().method() === "DELETE") {
      const requestUrl = new URL(route.request().url())
      const filter = requestUrl.searchParams.get("id") || ""
      const match = filter.match(/^in\.\((.*)\)$/)
      const ids = match?.[1]
        ? match[1].split(",").map((id) => id.trim()).filter(Boolean)
        : []

      if (ids.length > 0) {
        currentShoppingListItems = currentShoppingListItems.filter((item) => !ids.includes(item.id))
      }

      await route.fulfill({
        json: [],
        headers: {
          "content-type": "application/json",
        },
      })
      return
    }

    await route.fulfill({
      json: currentShoppingListItems,
      headers: {
        "content-type": "application/json",
      },
    })
  })

  await page.route("**/rpc/get_pricing_gaps", async (route) => {
    await route.fulfill({
      json: [],
      headers: {
        "content-type": "application/json",
      },
    })
  })

  await page.route("**/rpc/get_pricing", async (route) => {
    await route.fulfill({
      json: pricingEntries,
      headers: {
        "content-type": "application/json",
      },
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
      headers: {
        "content-type": "application/json",
      },
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
      headers: {
        "content-type": "application/json",
      },
    })
  })
}

test.describe("Store page merged ingredients", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log("[browser console.error]", message.text())
      }
    })
    page.on("pageerror", (error) => {
      console.log("[browser pageerror]", error.message)
    })
    await mockStorePageData(page)
    await page.goto("/store")
  })

  test("merges duplicate ingredients into one receipt row and keeps checkout aligned", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^Apples$/)).toHaveCount(1)
    await expect(page.getByText(/^Bananas$/)).toHaveCount(1)

    await page.getByRole("button", { name: /expand item details/i }).first().click()
    await expect(page.getByText("Cart quantity")).toBeVisible()
    await expect(page.getByText("3 each").first()).toBeVisible()

    await page.getByRole("button", { name: /proceed to checkout/i }).click()
    await expect(page).toHaveURL(/\/checkout\?/)

    const url = new URL(page.url())
    expect(url.searchParams.get("items")).toBe("2")
    expect(url.searchParams.get("total")).toBe("5.00")
  })

  test("deletes an item from the shopping list and updates the receipt", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })

    const deleteRequest = page.waitForRequest((request) =>
      request.method() === "DELETE" &&
      request.url().includes("/rest/v1/shopping_list_items")
    )

    await page.getByLabel("Remove Bananas").click()
    await deleteRequest

    await expect(page.getByText(/^Bananas$/)).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText(/^Apples$/)).toHaveCount(1)
    await page.getByRole("button", { name: /proceed to checkout/i }).click()

    const url = new URL(page.url())
    expect(url.searchParams.get("items")).toBe("1")
    expect(url.searchParams.get("total")).toBe("3.00")
  })

  test("updates the map popup total when cart quantity changes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/store")

    await expect(page.getByRole("heading", { name: /shopping receipt/i })).toBeVisible({ timeout: 15_000 })
    await page.getByTitle("Show map").click()

    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(3, { timeout: 15_000 })
    await page.locator(".leaflet-marker-icon").nth(1).click({ force: true })
    await expect(page.getByText("Total: $5.00")).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: /increase quantity for bananas/i }).click()

    await page.locator(".leaflet-marker-icon").nth(1).click({ force: true })
    await expect(page.getByText("Total: $5.50")).toBeVisible({ timeout: 15_000 })
  })
})
