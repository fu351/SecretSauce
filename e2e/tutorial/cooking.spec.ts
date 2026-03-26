/**
 * E2E smoke test: Cooking tutorial path ("Mastering the Craft")
 *
 * Steps: Dashboard (2 substeps) → Recipes (2 substeps) → Meal Planner (2 substeps) → Store (2 substeps)
 */

import { test, expect } from "@playwright/test"
import { resetTutorialState } from "../fixtures/tutorial-helpers"

test.describe("Cooking tutorial path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("completes all 4 steps without timing out", async ({ page }) => {
    // --- Start tutorial ---
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()

    // Select "Mastering the Craft" path
    await expect(page.getByText("Mastering the Craft")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Mastering the Craft").click()

    // Overlay should appear on dashboard
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.waitForURL(/\/dashboard/)

    // --- Step 1: Dashboard (2 substeps) ---
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-actions']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 2 — /recipes
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })

    // --- Step 2: Recipes (2 substeps) ---
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='recipe-search']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 3 — should navigate to /meal-planner
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/meal-planner/, { timeout: 10_000 })

    // --- Step 3: Meal Planner (2 substeps) ---
    await expect(page.locator("[data-tutorial='planner-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='planner-smart']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 4 — /store
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/store/, { timeout: 10_000 })

    // --- Step 4: Store (2 substeps) ---
    await expect(page.locator("[data-tutorial='store-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='store-selector']")).toBeVisible({ timeout: 8_000 })

    // Final next → tutorial completes
    await page.getByRole("button", { name: /next|finish|done/i }).click()

    // Overlay should disappear after completion
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 10_000 })
  })

  test("back navigation returns to previous substep", async ({ page }) => {
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()
    await expect(page.getByText("Mastering the Craft")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Mastering the Craft").click()

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Advance one substep then go back
    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-actions']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /back|previous/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })
  })

  test("skip tutorial sets dismissed state", async ({ page }) => {
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()
    await expect(page.getByText("Mastering the Craft")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Mastering the Craft").click()

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })

    // Open skip confirmation
    await page.getByRole("button", { name: /skip|exit|close/i }).first().click()
    // Confirm skip
    await page.getByRole("button", { name: /skip|yes|confirm/i }).first().click()

    // Overlay gone
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 5_000 })

    // localStorage should have dismiss flag
    const dismissed = await page.evaluate(() => localStorage.getItem("tutorial_dismissed_v1"))
    expect(dismissed).toBe("1")
  })
})
