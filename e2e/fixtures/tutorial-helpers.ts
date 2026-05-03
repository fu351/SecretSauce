/**
 * Shared helpers for tutorial E2E smoke tests.
 */

import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"
import { generalPages } from "../../lib/tutorial/content"

const TUTORIAL_STATE_KEY = "tutorial_state_v1"
const DISMISS_KEY = "tutorial_dismissed_v1"
const TUTORIAL_STATE_VERSION = 10

export function getTutorialSlotIndex(
  pagePath: string,
  stepId: number,
  isMobile = false
) {
  let index = 0

  for (const page of generalPages) {
    for (const step of page.steps) {
      if (step.mobileOnly && !isMobile) continue
      if (step.desktopOnly && isMobile) continue

      if (page.page === pagePath && step.id === stepId) {
        return index
      }

      index += 1
    }
  }

  throw new Error(`Tutorial slot not found for ${pagePath} step ${stepId}`)
}

/**
 * Seeds tutorial state before the first page navigation so tests do not need
 * to load a page, mutate localStorage, and immediately reload it.
 */
export async function seedTutorialStateBeforeNavigation(
  page: Page,
  currentSlotIndex = 0
) {
  await page.addInitScript(
    ({ key, version, currentSlotIndex }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ version, currentSlotIndex })
      )
    },
    {
      key: TUTORIAL_STATE_KEY,
      version: TUTORIAL_STATE_VERSION,
      currentSlotIndex,
    }
  )
}

/**
 * Clears tutorial state before the first page navigation.
 */
export async function clearTutorialStateBeforeNavigation(page: Page) {
  await page.addInitScript(
    ({ stateKey, dismissKey }) => {
      localStorage.removeItem(stateKey)
      localStorage.removeItem(dismissKey)
    },
    { stateKey: TUTORIAL_STATE_KEY, dismissKey: DISMISS_KEY }
  )
}

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
  const overlay = page.locator("[data-testid='tutorial-overlay']")
  const resumeCopy = overlay.getByText(/click to resume tutorial/i)

  if (await resumeCopy.isVisible().catch(() => false)) {
    await resumeCopy.click()
  }

  const primaryAction = overlay
    .getByRole("button", { name: /^next$|^finish$/i })
    .filter({ visible: true })
    .first()

  if (await primaryAction.isVisible().catch(() => false)) {
    await primaryAction.click()
    return
  }

  const overlayText = (await overlay.textContent().catch(() => "")) ?? ""
  const pageMatch = overlayText.match(
    /Click\s+([A-Za-z][A-Za-z ]+?)\s+in the navigation/i
  )

  if (pageMatch) {
    const pageNames: Record<string, string> = {
      Dashboard: "/dashboard",
      Recipes: "/recipes",
      "Meal Planner": "/meal-planner",
      Shopping: "/store",
      Home: "/home",
      Settings: "/settings",
    }
    const targetPath = pageNames[pageMatch[1].trim()]
    if (targetPath) {
      await page
        .locator(`[data-tutorial-nav="${targetPath}"]`)
        .filter({ visible: true })
        .first()
        .click()
      return
    }
  }

  throw new Error(
    "Could not find a Next/Finish button or a tutorial navigation target to advance the overlay."
  )
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
