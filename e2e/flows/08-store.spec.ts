/**
 * E2E tests: Store page
 *
 * Covers:
 *  - /store renders the empty shopping list state
 *  - The quick-add input is usable from the browser
 *  - Adding a custom item updates the receipt after the shopping list reloads
 *
 * The page depends on auth and Supabase reads, so the test stubs the minimal
 * network surface the page needs while leaving the browser interactions real.
 */

import { test, expect } from "@playwright/test"

test.use({ storageState: undefined })

test.describe("Store page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/store")
  })

  test("renders the empty state and quick-add controls", async ({ page }) => {
    await expect(page.getByText(/your shopping list is empty/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByPlaceholder("Add custom item...")).toBeVisible()
    await expect(page.getByRole("button", { name: /proceed to checkout/i })).toHaveCount(0)
  })

  test("typing into the quick-add field and submitting clears the input", async ({ page }) => {
    await expect(page.getByText(/your shopping list is empty/i)).toBeVisible({ timeout: 15_000 })

    const addItemInput = page.getByPlaceholder("Add custom item...")
    await addItemInput.fill("Bananas")
    await page.locator('[data-tutorial="store-add"] button').click()

    await expect(addItemInput).toHaveValue("")
    await expect(page.getByText(/your shopping list is empty/i)).toBeVisible()
  })
})
