import { expect, test } from "@playwright/test"

test.describe("Budget smoke flow", () => {
  test("authenticated user can open Savings and reach core actions", async ({ page }) => {
    await page.goto("/budget")
    await expect(page.getByRole("heading", { name: "Savings" })).toBeVisible({ timeout: 20_000 })

    const setupTitle = page.getByText("Start your first savings goal")
    const quickAddTitle = page.getByText("Quick add spend")

    if (await setupTitle.isVisible()) {
      await page.getByPlaceholder("Goal name").fill("Test Savings Goal")
      await page.getByPlaceholder("Target (cents)").fill("50000")
      await page.getByPlaceholder("Weekly budget (cents)").fill("10000")
      await page.getByRole("button", { name: "Create goal" }).click()
      await expect(quickAddTitle).toBeVisible({ timeout: 15_000 })
    } else {
      await expect(quickAddTitle).toBeVisible({ timeout: 15_000 })
    }

    await page.getByPlaceholder("Amount (cents)").fill("1200")
    await page.getByRole("button", { name: "Log spend" }).click()
    await expect(page.getByText("Source breakdown")).toBeVisible()
    await expect(page.getByText("Weekly wrap")).toBeVisible()
  })
})
