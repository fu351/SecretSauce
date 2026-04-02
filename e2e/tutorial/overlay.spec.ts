/**
 * E2E tests: Tutorial overlay UI behavior
 *
 * Covers minimize/restore, progress bar, navigation controls, and
 * the skip confirmation flow.
 */

import { test, expect } from "@playwright/test"
import {
  resetTutorialState,
  injectTutorialState,
  clickNext,
  waitForOverlayGone,
} from "../fixtures/tutorial-helpers"

test.describe("Tutorial overlay UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
    await injectTutorialState(page, ["cooking", "budgeting", "health"], 0)
    await page.goto("/dashboard")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
  })

  test("minimize button collapses the overlay content", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")

    // Full overlay shows step text
    await expect(overlay.getByRole("heading")).toBeVisible()

    // Click minimize
    await overlay.getByRole("button", { name: /minimize|collapse/i }).first().click()

    // Heading and Next button should no longer be visible
    await expect(overlay.getByRole("button", { name: /^next$|^finish$/i })).not.toBeVisible()
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
    // Total for 3 ranked goals = 24 slots
    await expect(overlay.getByText(/step 1 of 24/i)).toBeVisible({ timeout: 5_000 })
  })

  test("progress bar fills as steps advance", async ({ page }) => {
    const overlay = page.locator("[data-testid='tutorial-overlay']")
    const bar = overlay.locator(".bg-blue-500").first()

    const widthBefore = await bar.evaluate((el) => parseFloat(getComputedStyle(el).width))

    await clickNext(page)

    const widthAfter = await bar.evaluate((el) => parseFloat(getComputedStyle(el).width))
    expect(widthAfter).toBeGreaterThan(widthBefore)
  })

  test("back button is disabled on the first slot", async ({ page }) => {
    const backBtn = page.getByRole("button", { name: /back/i }).first()
    await expect(backBtn).toBeDisabled()
  })

  test("back button is enabled after advancing one slot", async ({ page }) => {
    await clickNext(page)
    const backBtn = page.getByRole("button", { name: /back/i }).first()
    await expect(backBtn).toBeEnabled()
  })

  test("skip shows confirmation dialog before dismissing", async ({ page }) => {
    // Click the X / exit button
    await page.locator("[data-testid='tutorial-overlay']").getByRole("button").filter({ hasText: "" }).last().click()

    // Confirmation dialog appears
    await expect(page.getByText(/end tutorial/i)).toBeVisible({ timeout: 3_000 })

    // Cancel — overlay should remain
    await page.getByRole("button", { name: /keep going/i }).click()
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible()
  })

  test("confirming skip dismisses the overlay", async ({ page }) => {
    // Open confirmation
    await page.locator("[data-testid='tutorial-overlay']").getByRole("button").last().click()
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
