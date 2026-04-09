/**
 * E2E tests: Shared tutorial flow
 *
 * Covers the simplified flat sequence: one shared walkthrough in a fixed
 * page-by-page order, regardless of ranked goal order.
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
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)
    await page.waitForURL(/\/recipes$/, { timeout: 10_000 })
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
  })

  test("the shared flow keeps the Tutorial label on page content", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    expect((await getOverlayHeaderLabel(page)).toLowerCase()).toContain("tutorial")
  })

  test("reordering ranked goals does not change the recipes slot content", async ({ page }) => {
    await injectTutorialState(page, ["health", "cooking", "budgeting"], 1)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Recipe Library" })).toBeVisible({ timeout: 5_000 })

    await injectTutorialState(page, ["budgeting", "health", "cooking"], 1)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Recipe Library" })).toBeVisible({ timeout: 5_000 })
  })

  test("home is still the last page in the shared walkthrough", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 15)
    await page.goto("/home")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Thanks for Exploring" })).toBeVisible({ timeout: 5_000 })
  })
})
