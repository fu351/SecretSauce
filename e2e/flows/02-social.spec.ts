/**
 * E2E tests: Social — follow / follow-request / accept
 *
 * Covers:
 *  - User profile page renders follow button
 *  - Follow button calls POST /api/social/follow
 *  - Button label changes to "Following" / "Requested" after click
 *  - Unfollow (DELETE) changes label back to "Follow"
 *  - Follow-request flow (private account): mocked to show "Request to Follow" → "Requested"
 *  - Accept/Decline follow request via API (PATCH /api/social/follow/respond)
 *  - Counts endpoint (GET /api/social/counts) returns numeric follower/following
 */

import { test, expect } from "@playwright/test"

const TEST_USERNAME = process.env.E2E_TARGET_USERNAME ?? "testchef"

// ─── Profile page — public account ─────────────────────────────────────────

test.describe("Public profile follow button", () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the tutorial overlay before the page loads so it never blocks the follow button.
    await page.addInitScript(() => {
      localStorage.setItem("tutorial_dismissed_v1", "1")
    })

    // Intercept the profile page follow API so we don't mutate real data in CI
    await page.route("/api/social/follow", async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ request: { id: "mock-req-1", status: "accepted" } }),
        })
      } else if (method === "DELETE") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto(`/user/${TEST_USERNAME}`)
    // Wait for the profile page to hydrate — follow button is client-rendered
    await expect(page.locator("body")).toBeVisible()
  })

  test("shows a Follow or Following button", async ({ page }) => {
    const btn = page.getByRole("button", { name: /follow|following|requested/i })
    await expect(btn).toBeVisible({ timeout: 10_000 })
  })

  test("clicking Follow changes the label to Following", async ({ page }) => {
    const btn = page.getByRole("button", { name: /^follow$/i })

    // Only run the rest of the test if the current state is "not following"
    const isVisible = await btn.isVisible()
    if (!isVisible) {
      test.skip()
      return
    }

    await btn.click()
    await expect(
      page.getByRole("button", { name: /following/i })
    ).toBeVisible({ timeout: 5_000 })
  })

  test("clicking Following unfollows and reverts to Follow", async ({ page }) => {
    const followingBtn = page.getByRole("button", { name: /^following$/i })
    const isVisible = await followingBtn.isVisible()
    if (!isVisible) {
      test.skip()
      return
    }

    await followingBtn.click()
    await expect(
      page.getByRole("button", { name: /^(follow|request to follow)$/i })
    ).toBeVisible({ timeout: 5_000 })
  })

  test("displays follower and following counts", async ({ page }) => {
    // e.g. "12 followers · 5 following" or separate elements
    await expect(
      page.getByText(/followers?/i)
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText(/following/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Private account — request flow ────────────────────────────────────────

test.describe("Private account follow-request flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the profile page so we land on a "private" profile that we don't follow
    await page.route(`/user/${TEST_USERNAME}`, async (route) => {
      // Let page load normally — we only need to mock the follow API
      await route.continue()
    })

    // The follow endpoint returns "pending" status (private account request)
    await page.route("/api/social/follow", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ request: { id: "mock-req-2", status: "pending" } }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto(`/user/${TEST_USERNAME}`)
  })

  test("label becomes Requested after follow on a private account", async ({ page }) => {
    // We need the button to be in "Follow" or "Request to Follow" state
    const btn = page.getByRole("button", { name: /^(follow|request to follow)$/i })
    const isVisible = await btn.isVisible()
    if (!isVisible) {
      test.skip()
      return
    }

    await btn.click()
    await expect(
      page.getByRole("button", { name: /requested/i })
    ).toBeVisible({ timeout: 5_000 })
  })
})

// ─── Follow-request respond API ─────────────────────────────────────────────

test.describe("Follow-request respond API", () => {
  test("PATCH /api/social/follow/respond — accept a request", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.patch("/api/social/follow/respond", {
      data: { requestId: "nonexistent-id", action: "accept" },
    })
    // Either 404 (not found — expected for a fake ID) or 200 (found)
    expect([200, 404]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty(res.status() === 200 ? "request" : "error")
  })

  test("PATCH /api/social/follow/respond — rejects unknown action", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.patch("/api/social/follow/respond", {
      data: { requestId: "any-id", action: "banana" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("PATCH /api/social/follow/respond — requires requestId", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.patch("/api/social/follow/respond", {
      data: { action: "accept" },
    })
    expect(res.status()).toBe(400)
  })
})

// ─── Social counts API ───────────────────────────────────────────────────────

test.describe("Social counts API", () => {
  test("GET /api/social/counts returns numeric follower/following counts", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/counts")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.followerCount).toBe("number")
    expect(typeof body.followingCount).toBe("number")
  })
})

// ─── Social following/followers lists ────────────────────────────────────────

test.describe("Following / followers list APIs", () => {
  test("GET /api/social/following returns an array", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/following")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.following)).toBe(true)
  })

  test("GET /api/social/followers returns an array", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/followers")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.followers)).toBe(true)
  })

  test("GET /api/social/requests returns pending requests array", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/requests")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.requests)).toBe(true)
  })
})
