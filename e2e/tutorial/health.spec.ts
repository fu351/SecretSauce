/**
 * E2E smoke test: Health tutorial path ("Elevate Your Journey")
 *
 * Steps: Dashboard (2 substeps) → Recipes (2 substeps) → Meal Planner (2 substeps) → Store (2 substeps)
 */

import { test, expect } from "@playwright/test"
import { resetTutorialState } from "../fixtures/tutorial-helpers"

test.describe("Health tutorial path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("completes all 4 steps without timing out", async ({ page }) => {
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()

    await expect(page.getByText("Elevate Your Journey")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Elevate Your Journey").click()

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.waitForURL(/\/dashboard/)

    // --- Step 1: Dashboard (2 substeps) ---
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-stats']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 2 — /recipes
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })

    // --- Step 2: Recipes (2 substeps) ---
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })
    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='recipe-filter']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 3 — /meal-planner
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
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 10_000 })
  })
})
