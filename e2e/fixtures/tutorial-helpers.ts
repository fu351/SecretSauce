/**
 * Shared helpers for tutorial E2E smoke tests.
 */

import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

/** Resets tutorial state in localStorage before a test. */
export async function resetTutorialState(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("tutorial_state_v1")
    localStorage.removeItem("tutorial_dismissed_v1")
  })
}

/** Opens the tutorial selection modal and starts the given path. */
export async function startTutorialPath(
  page: Page,
  pathName: "Mastering the Craft" | "Optimize Resources" | "Elevate Your Journey"
) {
  // The dashboard shows a tutorial prompt or there's a settings entry point.
  // Try the prompt banner first; fall back to settings.
  const prompt = page.locator("[data-testid='tutorial-prompt'], button:has-text('Start Tutorial'), button:has-text('Get Started')").first()
  if (await prompt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prompt.click()
  } else {
    // Navigate to settings and use the rewatch button
    await page.goto("/settings")
    await page.getByRole("button", { name: /tutorial|start|rewatch/i }).first().click()
  }

  // Select the path in the modal
  await expect(page.getByText(pathName)).toBeVisible({ timeout: 5_000 })
  await page.getByText(pathName).click()
  await page.getByRole("button", { name: /start|begin/i }).click()
}

/** Asserts the tutorial overlay is visible with the expected step title. */
export async function expectOverlayTitle(page: Page, title: string) {
  await expect(
    page.locator("[data-testid='tutorial-overlay'], [class*='tutorial']").getByText(title)
  ).toBeVisible({ timeout: 10_000 })
}

/** Clicks the Next button on the tutorial overlay. */
export async function clickNext(page: Page) {
  await page.getByRole("button", { name: /next|continue/i }).filter({ visible: true }).first().click()
}

/** Waits for the overlay to disappear (tutorial completed or skipped). */
export async function waitForOverlayGone(page: Page) {
  // The overlay SVG mask disappears on completion
  await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 10_000 })
}
