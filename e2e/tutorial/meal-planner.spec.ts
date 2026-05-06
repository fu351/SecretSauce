/**
 * E2E tests: meal planner tutorial edge cases
 *
 * These intentionally probe awkward orderings: mobile sheet confirmation,
 * unreachable targets after state changes, and clicks outside mandatory targets.
 */

import { test, expect, type Page } from "@playwright/test"
import { generalPages } from "../../lib/tutorial/content"
import {
  clickNext,
  getTutorialSlotIndex,
  seedTutorialStateBeforeNavigation,
} from "../fixtures/tutorial-helpers"

function visibleStepsFor(pagePath: string, isMobile: boolean) {
  return generalPages
    .filter((entry) => entry.page === pagePath)
    .flatMap((entry) =>
      entry.steps.filter((step) => {
        if (step.mobileOnly && !isMobile) return false
        if (step.desktopOnly && isMobile) return false
        return true
      })
    )
}

function stepIdsFor(pagePath: string, isMobile: boolean) {
  return visibleStepsFor(pagePath, isMobile).map((step) => step.id)
}

async function clickVisibleNavTarget(page: Page, selector: string) {
  const target = page.locator(selector).filter({ visible: true }).first()
  const box = await target.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

test.describe("Meal planner tutorial unconventional flows", () => {
  test("pre-prompt planner steps are display-only so meal cards cannot be opened early", () => {
    const displayOnlyStepIds = [1, 2, 3]

    for (const stepId of displayOnlyStepIds) {
      const step = visibleStepsFor("/meal-planner", false).find(
        (candidate) => candidate.id === stepId
      )

      expect(step?.lockInteraction, `step ${stepId} should lock page interactions`).toBe(true)
      expect(step?.blockClick, `step ${stepId} should block its highlighted planner target`).toBe(true)
      expect(step?.mandatory, `step ${stepId} should remain a Next-only explanation step`).toBeFalsy()
    }
  })

  test("mobile sequence skips the desktop-only sidebar close after confirm", () => {
    const mobileStepIds = stepIdsFor("/meal-planner", true)

    expect(mobileStepIds).toContain(10)
    expect(mobileStepIds).toContain(11)
    expect(mobileStepIds).not.toContain(12)

    const confirmIndex = mobileStepIds.indexOf(10)
    const verifyIndex = mobileStepIds.indexOf(11)
    expect(verifyIndex).toBe(confirmIndex + 1)
  })

  test("desktop sequence still teaches closing the open planner sidebar", () => {
    const desktopStepIds = stepIdsFor("/meal-planner", false)

    expect(desktopStepIds).toContain(8)
    expect(desktopStepIds).not.toContain(9)
    expect(desktopStepIds).not.toContain(10)
    expect(desktopStepIds).toContain(12)
    expect(desktopStepIds.indexOf(12)).toBeGreaterThan(desktopStepIds.indexOf(11))
  })

  test("mobile planner action steps are locked to their expected targets", () => {
    const mobileActionSteps = visibleStepsFor("/meal-planner", true).filter(
      (step) => step.mandatory
    )

    expect(mobileActionSteps.map((step) => step.id)).toEqual([5, 7, 9, 10])
    for (const step of mobileActionSteps) {
      expect(step.lockInteraction, `step ${step.id} should prevent out-of-order taps`).toBe(true)
    }
  })

  test("mobile confirm step completes on the filled slot, not on button click alone", () => {
    const confirmStep = visibleStepsFor("/meal-planner", true).find(
      (step) => step.id === 10
    )

    expect(confirmStep?.highlightSelector).toBe("[data-tutorial='planner-mobile-confirm-selections']")
    expect(confirmStep?.completionSelector).toBe("[data-tutorial='planner-today-filled-slot']")
  })

  test("mobile can advance from filled-slot verification directly toward shopping", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/meal-planner", 11, true)
    )

    await page.goto("/meal-planner")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Weekly Planner" })).toBeVisible({ timeout: 15_000 })

    await clickNext(page)
    await page.waitForURL(/\/store$/, { timeout: 15_000 })
  })

  test("mobile mandatory slot step blocks unrelated bottom-nav taps", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/meal-planner", 5, true)
    )

    await page.goto("/meal-planner")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='planner-today-slot']")).toBeVisible({ timeout: 15_000 })

    await clickVisibleNavTarget(page, "[data-tutorial-nav='/store']")
    await expect(page).toHaveURL(/\/meal-planner$/, { timeout: 2_000 })
  })

  test("clicking today's meal slot before the prompt does not open the recipe selector", async ({ page }) => {
    await seedTutorialStateBeforeNavigation(
      page,
      getTutorialSlotIndex("/meal-planner", 3)
    )

    await page.goto("/meal-planner")
    await expect(page.locator("[data-testid='tutorial-overlay']")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-tutorial='planner-today-slot']")).toBeVisible({ timeout: 15_000 })

    const slot = page.locator("[data-tutorial='planner-today-slot']").first()
    const box = await slot.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    await expect(page.locator("[data-tutorial='planner-sidebar']")).not.toBeVisible({ timeout: 2_000 })
    await expect(page.getByRole("heading", { name: "Weekly Planner" })).toBeVisible()
  })
})
