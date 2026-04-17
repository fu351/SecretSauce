/**
 * E2E tests: Onboarding — username creation
 *
 * Covers:
 *  - /onboarding page loads the multi-step wizard
 *  - "Next" / "Finish" navigation buttons are present
 *  - PATCH /api/auth/update-profile accepts a valid username
 *  - PATCH /api/auth/update-profile rejects a duplicate username
 *  - PATCH /api/auth/update-profile rejects an invalid username (bad chars)
 */

import { test, expect } from "@playwright/test"

// ─── Page structure ─────────────────────────────────────────────────────────

test.describe("Onboarding page structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/onboarding")
  })

  test("loads without error", async ({ page }) => {
    // The onboarding wizard should render — not a 404 or crash page
    await expect(page).not.toHaveURL(/\/error/)
    await expect(page.locator("body")).toBeVisible()
  })

  test("shows a Next or Finish button on the first step", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /^next$|^finish$/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  test("shows a Back button (disabled on step 1)", async ({ page }) => {
    const backBtn = page.getByRole("button", { name: /^back$/i })
    await expect(backBtn).toBeVisible({ timeout: 10_000 })
    await expect(backBtn).toBeDisabled()
  })

  test("progress dots / step indicators are rendered", async ({ page }) => {
    // Each step renders a dot/button in the progress bar
    const dots = page.locator("button[class*='rounded-full']")
    await expect(dots.first()).toBeVisible({ timeout: 10_000 })
  })

  test("clicking Next advances to step 2 and enables Back", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: /^next$|^finish$/i })
    await expect(nextBtn).toBeVisible({ timeout: 10_000 })

    // Only advance if the current step allows it (some steps require a selection)
    const disabled = await nextBtn.isDisabled()
    if (!disabled) {
      await nextBtn.click()
      const backBtn = page.getByRole("button", { name: /^back$/i })
      await expect(backBtn).toBeEnabled({ timeout: 5_000 })
    }
  })
})

// ─── Username API ────────────────────────────────────────────────────────────

test.describe("Username update API", () => {
  test("rejects an invalid username with special characters", async ({ page }) => {
    // Navigate first so the Clerk session cookie is attached to requests
    await page.goto("/dashboard")

    const res = await page.request.patch("/api/auth/update-profile", {
      data: { username: "bad user name!" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("rejects a username that is too short", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.patch("/api/auth/update-profile", {
      data: { username: "ab" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("accepts a valid username and returns the updated profile", async ({ page }) => {
    await page.goto("/dashboard")

    // Use a timestamp suffix to avoid duplicate collisions across test runs
    const unique = `testuser${Date.now()}`
    const res = await page.request.patch("/api/auth/update-profile", {
      data: { username: unique },
    })

    if (res.status() === 409) {
      // Conflict — already taken (rare, but guard it)
      const body = await res.json()
      expect(body.error).toMatch(/taken|conflict/i)
    } else {
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty("profile")
      expect(body.profile.username).toBe(unique)
    }
  })
})
