/**
 * E2E smoke tests: Health tutorial substeps (rank 3 by default, rank 1 when first)
 *
 * Rank 3 gets only essential substeps. When health is rank 1 it gets full depth.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  injectTutorialState,
  clickNext,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Health tutorial substeps in ranked session", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("health rank-3 shows only essential substep on dashboard", async ({ page }) => {
    // Inject at slot 0 (dashboard general)
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip to health slot: general(0) + cooking×2(1,2) + budgeting×1(3) = health at slot 4
    await clickNext(page)
    await clickNext(page)
    await clickNext(page)
    await clickNext(page) // → health rank-3 essential substep

    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Next should move to /recipes (health only gets 1 essential substep at rank 3)
    await clickNext(page)
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })
  })

  test("health rank-1 gets two substeps on dashboard", async ({ page }) => {
    // Health first = rank 1
    await injectTutorialState(page, ["health", "cooking", "budgeting"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip general slot
    await clickNext(page)

    // Health rank-1 substep 1
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Health rank-1 substep 2
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-stats']")).toBeVisible({ timeout: 8_000 })
  })

  test("health rank-1 first slot appears before cooking rank-2 on recipes page", async ({ page }) => {
    // Health first: health(rank1) → cooking(rank2) → budgeting(rank3)
    // Recipes page starts at slot 5 (1 general + 5 dashboard slots = index 5... wait)
    // health-first session: dashboard = 1 general + 2 health + 1 cooking + 1 budgeting = 5 slots (0-4)
    // recipes general = slot 5
    await injectTutorialState(page, ["health", "cooking", "budgeting"], 5)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip general (5) → health rank-1 substep 1 (6)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })

    // Health rank-1 substep 2 (7)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='recipe-filter']")).toBeVisible({ timeout: 8_000 })

    // Cooking rank-2 substep 1 (8) — after health's substeps
    await clickNext(page)
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("full session completes when health is rank 1", async ({ page }) => {
    await injectTutorialState(page, ["health", "cooking", "budgeting"], 23)
    await page.goto("/settings")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /finish/i }).click()
    await waitForOverlayGone(page)
  })
})
