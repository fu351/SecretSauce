/**
 * E2E smoke tests: Budgeting tutorial substeps (rank 2 by default, rank 1 when first)
 *
 * Verifies that budgeting's substeps appear in the correct position relative to
 * rank-1 and that rank-2 gets fewer substeps than rank-1 on the same page.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  injectTutorialState,
  clickNext,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Budgeting tutorial substeps in ranked session", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("rank-2 (budgeting) gets one substep on dashboard vs rank-1 (cooking) two", async ({ page }) => {
    // Start at dashboard general slot (index 0)
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip general (0) + cooking substep 1 (1) + cooking substep 2 (2) = now at budgeting rank-2 slot (3)
    await clickNext(page) // → cooking substep 1
    await clickNext(page) // → cooking substep 2
    await clickNext(page) // → budgeting rank-2 substep 1

    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Next should go to health rank-3 substep (4), NOT a second budgeting substep
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Next should navigate to /recipes (end of dashboard page)
    await clickNext(page)
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })
  })

  test("budgeting rank-1 gets two substeps on dashboard", async ({ page }) => {
    // Put budgeting first so it's rank 1
    await injectTutorialState(page, ["budgeting", "cooking", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip general slot
    await clickNext(page)

    // Budgeting rank-1 substep 1
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Budgeting rank-1 substep 2 (rank 1 gets both substeps)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-stats']")).toBeVisible({ timeout: 8_000 })
  })

  test("budgeting substeps appear after rank-1 on recipes page", async ({ page }) => {
    // Inject state at start of recipes page (slot 5 = general for recipes)
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 5)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Skip general (5) + cooking substep 1 (6) + cooking substep 2 (7) = now at budgeting slot (8)
    await clickNext(page) // cooking 1
    await clickNext(page) // cooking 2
    await clickNext(page) // budgeting rank-2

    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("full session completes when budgeting is rank 1", async ({ page }) => {
    // Use last slot index for budgeting-first session (same count: 24 slots)
    await injectTutorialState(page, ["budgeting", "cooking", "health"], 23)
    await page.goto("/settings")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /finish/i }).click()
    await waitForOverlayGone(page)
  })
})
