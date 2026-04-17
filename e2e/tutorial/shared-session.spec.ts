/**
 * E2E tests: Shared tutorial flow
 *
 * Covers the simplified flat sequence: one shared walkthrough in a fixed
 * page-by-page order.
 */

import { test, expect } from "@playwright/test"
import {
  clearTutorialStateBeforeNavigation,
  seedTutorialStateBeforeNavigation,
  clickNext,
  getOverlayHeaderLabel,
} from "../fixtures/tutorial-helpers"

test.describe("Shared tutorial flat sequence", () => {
  test("advancing from dashboard moves straight to recipes", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 2)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)
    await page.waitForURL(/\/recipes$/, { timeout: 10_000 })
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
  })

  test("the shared flow keeps the Tutorial label on page content", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    expect((await getOverlayHeaderLabel(page)).toLowerCase()).toContain("tutorial")
  })

  test("recipes still follow the shared tutorial content", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 3)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    // The heading only appears once the highlight engine locates [data-tutorial='recipe-filter'];
    // give it extra time for the /recipes page to fully hydrate and the element scan to resolve.
    await expect(page.getByRole("heading", { name: "Recipe Library" })).toBeVisible({ timeout: 15_000 })
  })

  test("home is still the last page in the shared walkthrough", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 30)
    await page.goto("/home")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Thanks for Exploring" })).toBeVisible({ timeout: 5_000 })
  })

  test("no persisted state means the overlay stays hidden", async ({ page }) => {
    await clearTutorialStateBeforeNavigation(page)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })
  })
})
