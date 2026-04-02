/**
 * E2E smoke tests: Cooking tutorial (rank 1 in default order)
 *
 * Flat sequence per page: 1 general slot → ranked substeps
 * Default ranking: cooking (rank 1, 2 substeps) → budgeting (rank 2, 1) → health (rank 3, 1)
 * Pages: Dashboard → Recipes → Meal Planner → Store → Settings
 * Total slots: 5 pages × (1 general + 2+1+1 ranked) = 24
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  startRankedTutorial,
  injectTutorialState,
  clickNext,
  clickBack,
  getOverlayHeaderLabel,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Cooking tutorial (rank 1 in ranked session)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("overlay shows Overview label for the first (general) slot", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    const label = await getOverlayHeaderLabel(page)
    expect(label.toLowerCase()).toContain("overview")
  })

  test("general slot is followed by Tutorial slots on dashboard", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Slot 0: general (no highlight expected)
    const labelBefore = await getOverlayHeaderLabel(page)
    expect(labelBefore.toLowerCase()).toContain("overview")

    // Slot 1: cooking rank-1 substep 1 — highlights dashboard-overview
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
    const labelAfter = await getOverlayHeaderLabel(page)
    expect(labelAfter.toLowerCase()).toContain("tutorial")
  })

  test("cooking rank-1 substeps appear before rank-2 substeps on dashboard", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Skip general slot
    await clickNext(page)

    // Cooking rank-1 substep 1
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Cooking rank-1 substep 2 (rank 1 gets both substeps)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-actions']")).toBeVisible({ timeout: 8_000 })

    // Budgeting rank-2 substep 1 (rank 2 gets only one)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("navigates through all 5 pages in order", async ({ page }) => {
    await startRankedTutorial(page)

    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Click through all dashboard slots (1 general + 4 ranked = 5)
    for (let i = 0; i < 5; i++) await clickNext(page)
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })

    // Click through all recipes slots (5)
    for (let i = 0; i < 5; i++) await clickNext(page)
    await page.waitForURL(/\/meal-planner/, { timeout: 10_000 })

    // Click through all meal-planner slots (5)
    for (let i = 0; i < 5; i++) await clickNext(page)
    await page.waitForURL(/\/store/, { timeout: 10_000 })

    // Click through all store slots (5)
    for (let i = 0; i < 5; i++) await clickNext(page)
    await page.waitForURL(/\/settings/, { timeout: 10_000 })
  })

  test("back navigation returns to previous slot", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Advance to slot 1 (first ranked substep)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Go back to slot 0 (general)
    await clickBack(page)
    const label = await getOverlayHeaderLabel(page)
    expect(label.toLowerCase()).toContain("overview")
  })

  test("back button is disabled on the first slot", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    const backBtn = page.getByRole("button", { name: /back/i }).first()
    await expect(backBtn).toBeDisabled()
  })

  test("skipping sets dismiss flag in localStorage", async ({ page }) => {
    await startRankedTutorial(page)
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Open skip confirmation
    await page.getByRole("button", { name: /exit|close/i }).first().click()
    // Confirm
    await page.getByRole("button", { name: /exit/i }).last().click()

    await waitForOverlayGone(page)

    const dismissed = await page.evaluate(() => localStorage.getItem("tutorial_dismissed_v1"))
    expect(dismissed).toBe("1")
  })

  test("completing full session removes state from localStorage", async ({ page }) => {
    // Inject state at the last slot (index 23) so we don't click through all 24
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 23)
    await page.goto("/settings")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /finish/i }).click()
    await waitForOverlayGone(page)

    const stored = await page.evaluate(() => localStorage.getItem("tutorial_state_v1"))
    expect(stored).toBeNull()
  })
})
