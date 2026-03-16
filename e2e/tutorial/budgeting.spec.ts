/**
 * E2E smoke test: Budgeting tutorial path ("Optimize Resources")
 *
 * Steps: Dashboard (2 substeps) → Meal Planner (2 substeps) → Store (3 substeps)
 */

import { test, expect } from "@playwright/test"
import { resetTutorialState } from "../fixtures/tutorial-helpers"

test.describe("Budgeting tutorial path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("completes all 3 steps without timing out", async ({ page }) => {
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()

    await expect(page.getByText("Optimize Resources")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Optimize Resources").click()

    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.waitForURL(/\/dashboard/)

    // --- Step 1: Financial Tracking (2 substeps) ---
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-stats']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 2 — /meal-planner
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/meal-planner/, { timeout: 10_000 })

    // --- Step 2: Smart Budget Planning (2 substeps) ---
    await expect(page.locator("[data-tutorial='planner-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='planner-smart']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 3 — /store
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/store/, { timeout: 10_000 })

    // --- Step 3: Retail Comparison (3 substeps) ---
    await expect(page.locator("[data-tutorial='store-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='store-add']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='store-selector']")).toBeVisible({ timeout: 8_000 })

    // Final next → tutorial completes
    await page.getByRole("button", { name: /next|finish|done/i }).click()
    await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 10_000 })
  })
})
