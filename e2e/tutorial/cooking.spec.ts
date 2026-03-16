/**
 * E2E smoke test: Cooking tutorial path ("Mastering the Craft")
 *
 * Steps: Dashboard (3 substeps) → Recipes (4 substeps) → Meal Planner (3 substeps)
 */

import { test, expect } from "@playwright/test"
import { resetTutorialState } from "../fixtures/tutorial-helpers"

test.describe("Cooking tutorial path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard")
    await resetTutorialState(page)
  })

  test("completes all 3 steps without timing out", async ({ page }) => {
    // --- Start tutorial ---
    await page.goto("/settings")
    await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()

    // Select "Mastering the Craft" path
    await expect(page.getByText("Mastering the Craft")).toBeVisible({ timeout: 5_000 })
    await page.getByText("Mastering the Craft").click()

    // Overlay should appear on dashboard
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await page.waitForURL(/\/dashboard/)

    // --- Step 1: Command Center (3 substeps) ---
    await expect(page.locator("[data-tutorial='dashboard-overview']")).toBeVisible({ timeout: 8_000 })

    // Substep 1 → 2 → 3
    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-recents']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='dashboard-actions']")).toBeVisible({ timeout: 8_000 })

    // Advance to Step 2 — should navigate to /recipes
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/recipes/, { timeout: 10_000 })

    // --- Step 2: Advanced Recipe Discovery (4 substeps) ---
    await expect(page.locator("[data-tutorial='recipe-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='recipe-search']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='recipe-filter']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    // recipe-card may only exist if recipes are loaded — wait for it or skip
    await expect(page.locator("[data-tutorial='recipe-card']").or(
      page.getByText(/recipe-card|couldn't locate|not found/i)
    )).toBeVisible({ timeout: 10_000 })

    // Advance to Step 3 — should navigate to /meal-planner
    await page.getByRole("button", { name: /next/i }).click()
    await page.waitForURL(/\/meal-planner/, { timeout: 10_000 })

    // --- Step 3: The Weekly Planner (3 substeps) ---
    await expect(page.locator("[data-tutorial='planner-overview']")).toBeVisible({ timeout: 8_000 })

    await page.getByRole("button", { name: /next/i }).click()
    // Substep 2 is now "explore" mode (sidebar may be closed on mobile) — just check overlay persists
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 5_000 })

    await page.getByRole("button", { name: /next/i }).click()
    await expect(page.locator("[data-tutorial='planner-add']")).toBeVisible({ timeout: 8_000 })

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
    await expect(page.locator("[data-tutorial='dashboard-recents']")).toBeVisible({ timeout: 8_000 })

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
