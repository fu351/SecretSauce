/**
 * E2E tests: Shared tutorial flow
 *
 * Covers the simplified flat sequence: one shared walkthrough in a fixed
 * page-by-page order.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  injectTutorialState,
  clickNext,
  getOverlayHeaderLabel,
} from "../fixtures/tutorial-helpers"

test.describe("Shared tutorial flat sequence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("advancing from dashboard moves straight to recipes", async ({ page }) => {
    await injectTutorialState(page, 2)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)
    await page.waitForURL(/\/recipes$/, { timeout: 10_000 })
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
  })

  test("the shared flow keeps the Tutorial label on page content", async ({ page }) => {
    await injectTutorialState(page, 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    expect((await getOverlayHeaderLabel(page)).toLowerCase()).toContain("tutorial")
  })

  test("recipes still follow the shared tutorial content", async ({ page }) => {
    await injectTutorialState(page, 3)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Recipe Library" })).toBeVisible({ timeout: 5_000 })
  })

  test("home is still the last page in the shared walkthrough", async ({ page }) => {
    await injectTutorialState(page, 25)
    await page.goto("/home")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Thanks for Exploring" })).toBeVisible({ timeout: 5_000 })
  })
})
