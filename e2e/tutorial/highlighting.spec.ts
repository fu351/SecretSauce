/**
 * E2E tests: Tutorial highlight behavior
 *
 * These tests cover regressions where unrelated page loaders or in-place target
 * UI changes can hide or stale the highlight overlay.
 */

import { test, expect } from "@playwright/test"
import {
  getTutorialSlotIndex,
  seedTutorialStateBeforeNavigation,
} from "../fixtures/tutorial-helpers"

test.describe("Tutorial highlighting", () => {
  test("shows a visible highlight ring for the current target", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/dashboard", 1)
    )
    await page.goto("/dashboard")

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-testid='tutorial-highlight-ring']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toContainText(/waiting for page to load/i)

    const targetBox = await page.locator("[data-tutorial='dashboard-stats']").boundingBox()
    expect(targetBox).not.toBeNull()

    const targetCenter = {
      x: targetBox!.x + targetBox!.width / 2,
      y: targetBox!.y + targetBox!.height / 2,
    }
    const coveringPanelCount = await page.locator("[data-testid='tutorial-backdrop-panel']").evaluateAll(
      (panels, point) =>
        panels.filter((panel) => {
          const rect = panel.getBoundingClientRect()
          return (
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom
          )
        }).length,
      targetCenter
    )

    expect(coveringPanelCount).toBe(0)
  })

  test("keeps highlighting when an unrelated loader appears elsewhere on the page", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/dashboard", 1)
    )
    await page.goto("/dashboard")

    const overlay = page.locator("[data-testid='tutorial-overlay']")
    const ring = page.locator("[data-testid='tutorial-highlight-ring']")

    await expect(overlay).toBeVisible({ timeout: 10_000 })
    await expect(ring).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => {
      const loader = document.createElement("div")
      loader.className = "fixed bottom-0 left-0 h-4 w-4 animate-pulse"
      loader.setAttribute("data-testid", "unrelated-loader")
      document.body.appendChild(loader)
    })

    await expect(page.getByTestId("unrelated-loader")).toBeVisible()
    await expect(overlay).not.toContainText(/waiting for page to load/i, { timeout: 2_000 })
    await expect(ring).toBeVisible()
  })

  test("updates the ring when the highlighted target changes size in place", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/dashboard", 1)
    )
    await page.goto("/dashboard")

    const target = page.locator("[data-tutorial='dashboard-stats']").first()
    const ring = page.locator("[data-testid='tutorial-highlight-ring']")

    await expect(ring).toBeVisible({ timeout: 10_000 })
    const heightBefore = await ring.evaluate((el) => el.getBoundingClientRect().height)

    await target.evaluate((el) => {
      const spacer = document.createElement("div")
      spacer.textContent = "extra tutorial height"
      spacer.style.height = "160px"
      el.appendChild(spacer)
    })

    await expect
      .poll(() => ring.evaluate((el) => el.getBoundingClientRect().height), {
        timeout: 5_000,
      })
      .toBeGreaterThan(heightBefore + 100)
  })
})
