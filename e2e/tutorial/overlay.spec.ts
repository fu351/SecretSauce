/**
 * E2E tests: Tutorial overlay UI behavior
 *
 * Covers minimize/restore, progress bar, navigation controls, and
 * the skip confirmation flow.
 */

import { test, expect } from "@playwright/test"
import { generalPages } from "../../contents/tutorial-content"
import { seedTutorialStateBeforeNavigation, clickNext, waitForOverlayGone } from "../fixtures/tutorial-helpers"

function getExpectedStepCount(isMobile: boolean) {
  return generalPages.reduce((total, page) => {
    return (
      total +
      page.steps.filter((step) => {
        if (step.mobileOnly && !isMobile) return false
        if (step.desktopOnly && isMobile) return false
        return true
      }).length
    )
  }, 0)
}

test.describe("Tutorial overlay UI", () => {
  test.beforeEach(async ({ page }) => {
    await seedTutorialStateBeforeNavigation(page, 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
  })

  test("minimize button collapses the overlay content", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")
    const nextButton = overlay
      .getByRole("button", { name: /^next$|^finish$/i })
      .first()

    // Full overlay exposes the primary action before collapsing.
    await expect(nextButton).toBeVisible()

    // Click minimize
    await overlay.getByRole("button", { name: /minimize|collapse/i }).first().click()

    // Heading and Next button should no longer be visible
    await expect(nextButton).not.toBeVisible()
    await expect(overlay.getByText(/click to resume/i)).toBeVisible({ timeout: 3_000 })
  })

  test("clicking the minimized overlay restores it", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")

    // Minimize
    await overlay.getByRole("button", { name: /minimize|collapse/i }).first().click()
    await expect(overlay.getByText(/click to resume/i)).toBeVisible({ timeout: 3_000 })

    // Click the minimized body to restore
    await overlay.getByText(/click to resume/i).click()
    await expect(overlay.getByRole("button", { name: /^next$|^finish$/i })).toBeVisible({ timeout: 3_000 })
  })

  test("progress label shows 1 of total on first slot", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")
    const viewport = page.viewportSize()
    const expectedTotal = getExpectedStepCount((viewport?.width ?? 1280) < 768)
    await expect(
      overlay.getByText(new RegExp(`step 1 of ${expectedTotal}`, "i"))
    ).toBeVisible({ timeout: 5_000 })
  })

  test("progress bar fills as steps advance", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")
    const bar = overlay.getByTestId("tutorial-progress-fill")
    const viewport = page.viewportSize()
    const expectedTotal = getExpectedStepCount((viewport?.width ?? 1280) < 768)

    const widthBefore = await bar.evaluate((el) => parseFloat(getComputedStyle(el).width))

    await clickNext(page)
    await expect(
      overlay.getByText(new RegExp(`step 2 of ${expectedTotal}`, "i"))
    ).toBeVisible({ timeout: 5_000 })

    await expect
      .poll(
        () => bar.evaluate((el) => parseFloat(getComputedStyle(el).width)),
        { timeout: 2_000 }
      )
      .toBeGreaterThan(widthBefore)
  })

  test("back button is disabled on the first slot", async ({ page }) => {
    const backBtn = page
      .locator("[data-testid='tutorial-overlay']")
      .getByRole("button", { name: /back/i })
      .first()
    await expect(backBtn).toBeDisabled()
  })

  test("back button is enabled after advancing one slot", async ({ page }) => {
    await clickNext(page)
    const backBtn = page
      .locator("[data-testid='tutorial-overlay']")
      .getByRole("button", { name: /back/i })
      .first()
    await expect(backBtn).toBeEnabled()
  })

  test("skip shows confirmation dialog before dismissing", async ({ page }) => {
    // Click the X / exit button
    await page
      .locator("[data-testid='tutorial-overlay']")
      .getByRole("button", { name: /^exit tutorial$/i })
      .click()

    // Confirmation dialog appears
    await expect(page.getByText(/end tutorial/i)).toBeVisible({ timeout: 3_000 })

    // Cancel — overlay should remain
    await page.getByRole("button", { name: /keep going/i }).click()
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible()
  })

  test("confirming skip dismisses the overlay", async ({ page }) => {
    // Open confirmation
    await page
      .locator("[data-testid='tutorial-overlay']")
      .getByRole("button", { name: /^exit tutorial$/i })
      .click()
    await expect(page.getByText(/end tutorial/i)).toBeVisible({ timeout: 3_000 })

    // Confirm exit
    await page.getByRole("button", { name: /^exit$/i }).click()
    await waitForOverlayGone(page)
  })

  test("overlay persists across same-page interactions", async ({ page }) => {
    // Click somewhere on the page outside the overlay — should minimize, not close
    await page.locator("body").click({ position: { x: 100, y: 100 }, force: true })

    // Overlay should still be in the DOM (minimized or full)
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 3_000 })
  })
})
