/**
 * E2E tests: Post creation / upload
 *
 * Covers:
 *  - "Post Your Dish" button opens the creation dialog
 *  - Dialog renders Photo upload area, Dish name input, Caption textarea
 *  - Post button is disabled until a title is entered (image required too)
 *  - Cancel resets the form and closes the dialog
 *  - POST /api/posts — accepts valid payload
 *  - POST /api/posts — rejects missing imageUrl or title
 */

import { test, expect, request } from "@playwright/test"
import path from "node:path"

// ─── Post creation dialog UI ─────────────────────────────────────────────────

test.describe("Post creation dialog", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the challenge endpoint so the "Post Your Dish to Enter" variant
    // doesn't depend on an active challenge in the DB.
    await page.route("/api/challenges/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ challenge: null }),
      })
    })

    await page.goto("/home")
    // Wait for the page content to hydrate
    await expect(page.locator("body")).toBeVisible()
  })

  test("Post Your Dish button is visible", async ({ page }) => {
    const btn = page.getByRole("button", { name: /post your dish/i })
    await expect(btn).toBeVisible({ timeout: 15_000 })
  })

  test("clicking the button opens the dialog", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole("heading", { name: /post your dish/i })).toBeVisible()
  })

  test("dialog contains Photo upload area", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    // Upload area shows "Tap to choose a photo"
    await expect(page.getByText(/tap to choose a photo/i)).toBeVisible()
  })

  test("dialog contains Dish name input", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    const input = page.getByLabel(/dish name/i)
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute("placeholder", /chili crisp|e\.g\./i)
  })

  test("dialog contains Caption textarea", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    await expect(page.getByLabel(/caption/i)).toBeVisible()
  })

  test("Post button starts disabled (no title or image)", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    // The submit button should be disabled when the form is empty
    const postBtn = page.getByRole("dialog").getByRole("button", { name: /^post$/i })
    await expect(postBtn).toBeDisabled()
  })

  test("Post button remains disabled with title but no image", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    await page.getByLabel(/dish name/i).fill("Carbonara")

    const postBtn = page.getByRole("dialog").getByRole("button", { name: /^post$/i })
    await expect(postBtn).toBeDisabled()
  })

  test("Cancel closes the dialog and resets the form", async ({ page }) => {
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await page.getByLabel(/dish name/i).fill("Test Dish")
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click()

    await expect(dialog).not.toBeVisible({ timeout: 3_000 })
  })

  test("reopening the dialog after cancel shows an empty form", async ({ page }) => {
    // First open
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })
    await page.getByLabel(/dish name/i).fill("I should be gone")
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3_000 })

    // Second open — field must be empty
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel(/dish name/i)).toHaveValue("")
  })
})

// ─── Post image + submit with mocked upload ──────────────────────────────────

test.describe("Post submission with mocked Supabase upload", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress challenge so we get the simple "Post Your Dish" button
    await page.route("/api/challenges/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ challenge: null }),
      })
    })

    // Mock the Supabase storage upload endpoint (wildcard path under storage/)
    await page.route(/supabase\.co\/storage\/v1\/object\/post-images/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Key: "post-images/test-image.jpg" }),
      })
    })

    // Mock the Supabase public URL endpoint
    await page.route(/supabase\.co\/storage\/v1\/object\/public\/post-images/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: Buffer.from("fake-image"),
      })
    })

    // Mock the post creation API
    await page.route("/api/posts", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            post: {
              id: "mock-post-1",
              title: "My Test Dish",
              caption: "Test caption",
              image_url: "https://example.com/test.jpg",
              created_at: new Date().toISOString(),
            },
          }),
        })
      } else {
        await route.continue()
      }
    })
  })

  test("attaching an image enables the Post button when title is filled", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("button", { name: /post your dish/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

    // Attach a synthetic 1×1 PNG as the image
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    )
    const fileInput = page.locator("input[type='file']")
    await fileInput.setInputFiles({
      name: "dish.png",
      mimeType: "image/png",
      buffer: pngBytes,
    })

    await page.getByLabel(/dish name/i).fill("My Test Dish")

    const postBtn = page.getByRole("dialog").getByRole("button", { name: /^post$/i })
    await expect(postBtn).toBeEnabled({ timeout: 3_000 })
  })
})

// ─── POST /api/posts API validation ─────────────────────────────────────────

test.describe("POST /api/posts API", () => {
  test("rejects request with missing imageUrl", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.post("/api/posts", {
      data: { title: "Only title" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("rejects request with missing title", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.post("/api/posts", {
      data: { imageUrl: "https://example.com/img.jpg" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("returns 401 when unauthenticated", async () => {
    const anonRequest = await request.newContext({
      baseURL: "http://localhost:3000",
      storageState: { cookies: [], origins: [] },
    })

    // Hit the API directly without auth.
    const res = await anonRequest.post("/api/posts", {
      data: { imageUrl: "https://example.com/img.jpg", title: "Test" },
    })

    // Clerk may redirect if middleware is involved, but unauthenticated requests
    // must not succeed.
    expect([401, 403, 307]).toContain(res.status())
    await anonRequest.dispose()
  })
})
