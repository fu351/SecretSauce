/**
 * E2E tests: Ranked session flow
 *
 * Covers the flat-sequence model: each page is visited once, general slot first,
 * then ranked tutorial substeps in order with depth proportional to rank.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  startRankedTutorial,
  injectTutorialState,
  clickNext,
  getOverlayHeaderLabel,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Ranked session flat sequence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("each page is visited exactly once in order", async ({ page }) => {
    const pagesVisited: string[] = []

    // Track navigations
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const url = new URL(frame.url())
        const path = url.pathname
        if (["/dashboard", "/recipes", "/meal-planner", "/store", "/settings"].includes(path)) {
          if (pagesVisited.at(-1) !== path) pagesVisited.push(path)
        }
      }
    })

    await startRankedTutorial(page)

    // Click through all 24 slots
    for (let i = 0; i < 24; i++) {
      await clickNext(page)
    }
    await waitForOverlayGone(page)

    expect(pagesVisited).toEqual(["/dashboard", "/recipes", "/meal-planner", "/store", "/settings"])
  })

  test("settings page is the last page in the session", async ({ page }) => {
    // Inject at slot 19 (last store slot), next click should navigate to /settings
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 19)
    await page.goto("/store")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)
    await page.waitForURL(/\/settings/, { timeout: 10_000 })
  })

  test("general slot label is Overview; ranked slot label is Tutorial", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Slot 0: general
    expect((await getOverlayHeaderLabel(page)).toLowerCase()).toContain("overview")

    // Slot 1: cooking rank-1
    await clickNext(page)
    expect((await getOverlayHeaderLabel(page)).toLowerCase()).toContain("tutorial")
  })

  test("rank-1 tutorial gets more substeps per page than rank-2", async ({ page }) => {
    // On dashboard: cooking(rank1) = 2 substeps, budgeting(rank2) = 1 substep
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 1)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Cooking substep 1
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
    // Cooking substep 2
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-actions']")).toBeVisible({ timeout: 8_000 })
    // Budgeting substep 1 (rank 2 — only one)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
    // Health substep (rank 3 — essential only, one)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
    // Navigates to next page
    await clickNext(page)
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })
  })

  test("reordering ranking changes which tutorial substeps appear first", async ({ page }) => {
    // Health first: health substeps should appear before cooking substeps on dashboard
    await injectTutorialState(page, ["health", "cooking", "budgeting"], 1)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Slot 1 = health rank-1 substep 1 (dashboard-overview)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Slot 2 = health rank-1 substep 2 (dashboard-stats — health has stats, not actions)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-stats']")).toBeVisible({ timeout: 8_000 })

    // Slot 3 = cooking rank-2 substep 1 (dashboard-overview — only one substep)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("progress label increments through the session", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    const overlay = page.locator("[data-testid='tutorial-overlay']")

    await expect(overlay.getByText(/step 1 of/i)).toBeVisible({ timeout: 5_000 })

    await clickNext(page)
    await expect(overlay.getByText(/step 2 of/i)).toBeVisible({ timeout: 5_000 })
  })
})
