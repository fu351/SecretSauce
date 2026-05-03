/**
 * E2E tests: Tutorial state persistence via localStorage
 *
 * Verifies the tutorial resumes correctly after a page refresh, that the
 * dismiss flag prevents re-activation, and that completion clears state.
 */

import { test, expect } from "@playwright/test"
import {
  seedTutorialStateBeforeNavigation,
  clickNext,
  getTutorialSlotIndex,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Tutorial state persistence", () => {
  test("resumes at the correct slot after a hard refresh", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/recipes", 1)
    )
    await page.goto("/recipes")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-filter']")).toBeVisible({ timeout: 8_000 })

    // Reload
    await page.reload()

    // Overlay should reappear on the same page at the same slot
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-filter']")).toBeVisible({ timeout: 8_000 })
  })

  test("advancing a step then refreshing resumes at the new slot", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/recipes", 1)
    )
    await page.goto("/recipes")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Advance to slot 4 (recipe-search)
    await clickNext(page)
    await expect(page.locator("[data-tutorial='recipe-search']")).toBeVisible({ timeout: 8_000 })

    // Reload — should resume at slot 4
    await page.reload()
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='recipe-search']")).toBeVisible({ timeout: 8_000 })
  })

  test("dismiss flag prevents tutorial from resuming after refresh", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 3)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Set dismiss flag
    await page.evaluate(() => localStorage.setItem("tutorial_dismissed_v1", "1"))
    await page.reload()

    // Overlay should not appear
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })
  })

  test("completing the tutorial clears localStorage state", async ({ page }) => {
    await page.route("/api/auth/update-profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile: {
            tutorial_completed: true,
            tutorial_completed_at: new Date().toISOString(),
          },
        }),
      })
    })

    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/home", 2)
    )
    await page.goto("/home")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await page.locator("[data-tutorial-nav='/dashboard']").first().click()
    await waitForOverlayGone(page)

    const stored = await page.evaluate(() => localStorage.getItem("tutorial_state_v1"))
    expect(stored).toBeNull()
  })

  test("outdated state version is discarded and overlay does not appear", async ({ page }) => {
    // Navigate first so localStorage writes land on the correct origin, then
    // inject an outdated version and reload — no initScript so the stale state
    // is not accidentally cleared before the context can evaluate it.
    await page.goto("/dashboard")
    await page.evaluate(() => {
      localStorage.removeItem("tutorial_dismissed_v1")
      localStorage.setItem(
        "tutorial_state_v1",
        JSON.stringify({ version: 1, currentSlotIndex: 0 })
      )
    })
    await page.reload()

    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })
  })

  test("state is saved after each Next click", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    await clickNext(page)

    const raw = await page.evaluate(() => localStorage.getItem("tutorial_state_v1"))
    const state = JSON.parse(raw ?? "{}")
    expect(state.currentSlotIndex).toBe(1)
  })
})
