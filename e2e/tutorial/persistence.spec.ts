/**
 * E2E tests: Tutorial state persistence via localStorage
 *
 * Verifies the tutorial resumes correctly after a page refresh, that the
 * dismiss flag prevents re-activation, and that completion clears state.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  injectTutorialState,
  clickNext,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Tutorial state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("resumes at the correct slot after a hard refresh", async ({ page }) => {
    // Inject state at slot 1 (recipes page overview)
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 1)
    await page.goto("/recipes")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })

    // Reload
    await page.reload()

    // Overlay should reappear on the same page at the same slot
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("advancing a step then refreshing resumes at the new slot", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 1)
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Advance to slot 2 (recipe-card)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='recipe-card']")).toBeVisible({ timeout: 8_000 })

    // Reload — should resume at slot 2
    await page.reload()
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-card']")).toBeVisible({ timeout: 8_000 })
  })

  test("dismiss flag prevents tutorial from resuming after refresh", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 3)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Set dismiss flag
    await page.evaluate(() => localStorage.setItem("tutorial_dismissed_v1", "1"))
    await page.reload()

    // Overlay should not appear
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })
  })

  test("completing the tutorial clears localStorage state", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 16)
    await page.goto("/home")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await page.locator("[data-tutorial-nav='/dashboard']").first().click()
    await waitForOverlayGone(page)

    const stored = await page.evaluate(() => localStorage.getItem("tutorial_state_v1"))
    expect(stored).toBeNull()
  })

  test("outdated state version is discarded and overlay does not appear", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "tutorial_state_v1",
        JSON.stringify({ version: 1, rankedGoals: ["cooking"], currentSlotIndex: 0 })
      )
    })
    await page.goto("/dashboard")

    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })
  })

  test("state is saved after each Next click", async ({ page }) => {
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)

    const raw = await page.evaluate(() => localStorage.getItem("tutorial_state_v1"))
    const state = JSON.parse(raw ?? "{}")
    expect(state.currentSlotIndex).toBe(1)
    expect(state.rankedGoals).toEqual(["cooking", "budgeting", "health"])
  })
})
