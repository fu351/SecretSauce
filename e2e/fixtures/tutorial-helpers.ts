/**
 * Shared helpers for tutorial E2E smoke tests.
 */

import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

const TUTORIAL_STATE_KEY = "tutorial_state_v1"
const DISMISS_KEY = "tutorial_dismissed_v1"
const TUTORIAL_STATE_VERSION = 10

/** Resets tutorial state in localStorage before a test. */
export async function resetTutorialState(page: Page) {
  await page.evaluate(
    ({ stateKey, dismissKey }) => {
      localStorage.removeItem(stateKey)
      localStorage.removeItem(dismissKey)
    },
    { stateKey: TUTORIAL_STATE_KEY, dismissKey: DISMISS_KEY }
  )
}

/**
 * Injects tutorial state directly into localStorage, bypassing the UI.
 * Useful for testing mid-session behavior without clicking through earlier steps.
 */
export async function injectTutorialState(
  page: Page,
  currentSlotIndex = 0
) {
  await page.evaluate(
    ({ key, version, currentSlotIndex }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ version, currentSlotIndex })
      )
      localStorage.removeItem("tutorial_dismissed_v1")
    },
    { key: TUTORIAL_STATE_KEY, version: TUTORIAL_STATE_VERSION, currentSlotIndex }
  )
}

/**
 * Opens the tutorial modal from the settings page and clicks Start Tour.
 * Returns after the overlay is visible and the browser has navigated to the first page.
 */
export async function startTutorialFromSettings(page: Page) {
  await page.goto("/settings")
  await page.getByRole("button", { name: /rewatch|start|tutorial/i }).first().click()
  await expect(page.locator("[data-testid='tutorial-overlay']").or(
    page.getByRole("dialog")
  )).toBeVisible({ timeout: 5_000 })
  await page.getByRole("button", { name: /start tour/i }).click()
  await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
}

/** Clicks Next on the tutorial overlay. */
export async function clickNext(page: Page) {
  await page
    .locator("[data-testid='tutorial-overlay']")
    .getByRole("button", { name: /^next$|^finish$/i })
    .filter({ visible: true })
    .first()
    .click()
}

/** Clicks Back on the tutorial overlay. */
export async function clickBack(page: Page) {
  await page
    .locator("[data-testid='tutorial-overlay']")
    .getByRole("button", { name: /back/i })
    .filter({ visible: true })
    .first()
    .click()
}

/** Returns the current header label text (e.g. "OVERVIEW" or "TUTORIAL"). */
export async function getOverlayHeaderLabel(page: Page): Promise<string> {
  const overlay = page.locator("[data-testid='tutorial-overlay']")
  // The label is the small uppercase span in the overlay header
  return (await overlay.locator("span.uppercase").first().textContent() ?? "").trim()
}

/** Asserts the tutorial overlay is visible with the expected step title. */
export async function expectOverlayTitle(page: Page, title: string) {
  await expect(
    page.locator("[data-testid='tutorial-overlay']").getByText(title)
  ).toBeVisible({ timeout: 10_000 })
}

/** Waits for the overlay to disappear (tutorial completed or skipped). */
export async function waitForOverlayGone(page: Page) {
  await expect(page.locator("[data-testid='tutorial-overlay']")).not.toBeVisible({ timeout: 10_000 })
}
