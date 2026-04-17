/**
 * E2E tests: Notifications widget
 *
 * Covers:
 *  - NotificationsWidget renders on /dashboard
 *  - Shows "Nothing new" when notification list is empty
 *  - Renders follow_request notification with Accept / Decline buttons
 *  - Clicking Accept calls PATCH /api/social/follow/respond with action "accept"
 *    and changes the item to "started following you"
 *  - Clicking Decline calls PATCH with action "reject" and removes the item
 *  - Renders new_follower notification text
 *  - Renders post_like notification text
 *  - Renders post_repost notification text
 *  - GET /api/social/notifications returns the correct shape
 */

import { test, expect } from "@playwright/test"

const MOCK_FOLLOW_REQUEST_NOTIFICATION = {
  type: "follow_request",
  requestId: "req-abc-123",
  from: {
    id: "profile-x",
    full_name: "Pepper Mills",
    avatar_url: null,
    username: "peppermills",
  },
  created_at: new Date(Date.now() - 300_000).toISOString(),
}

const MOCK_NEW_FOLLOWER_NOTIFICATION = {
  type: "new_follower",
  from: {
    id: "profile-y",
    full_name: "Basil Greene",
    avatar_url: null,
    username: "basilgreene",
  },
  created_at: new Date(Date.now() - 900_000).toISOString(),
}

const MOCK_POST_LIKE_NOTIFICATION = {
  type: "post_like",
  from: {
    id: "profile-z",
    full_name: "Cheddar Block",
    avatar_url: null,
    username: "cheddarblock",
  },
  post: { id: "post-1", title: "Truffle Pasta" },
  created_at: new Date(Date.now() - 1_800_000).toISOString(),
}

const MOCK_POST_REPOST_NOTIFICATION = {
  type: "post_repost",
  from: {
    id: "profile-w",
    full_name: "Saffron Twist",
    avatar_url: null,
    username: "saffrontwist",
  },
  post: { id: "post-2", title: "Miso Ramen" },
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
}

// ─── Widget renders ──────────────────────────────────────────────────────────

test.describe("NotificationsWidget — empty state", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [] }),
      })
    })
    // Suppress friends-preview to avoid noise
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.goto("/dashboard")
  })

  test("Notifications card heading is visible", async ({ page }) => {
    await expect(page.getByText("Notifications")).toBeVisible({ timeout: 15_000 })
  })

  test("shows empty-state message when there are no notifications", async ({ page }) => {
    await expect(
      page.getByText(/nothing new|check back/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Follow request — Accept ─────────────────────────────────────────────────

test.describe("NotificationsWidget — accept follow request", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [MOCK_FOLLOW_REQUEST_NOTIFICATION] }),
      })
    })
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.route("/api/social/follow/respond", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ request: { id: "req-abc-123", status: "accepted" } }),
      })
    })
    await page.goto("/dashboard")
  })

  test("renders the sender name for a follow request", async ({ page }) => {
    await expect(page.getByText("Pepper Mills")).toBeVisible({ timeout: 15_000 })
  })

  test("renders 'wants to follow you' text", async ({ page }) => {
    await expect(page.getByText(/wants to follow you/i)).toBeVisible({ timeout: 10_000 })
  })

  test("Accept button is visible for a follow request", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /accept/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Decline button is visible for a follow request", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /decline/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  test("clicking Accept calls the respond endpoint and updates the UI", async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null

    await page.route("/api/social/follow/respond", async (route) => {
      capturedBody = await route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ request: { id: "req-abc-123", status: "accepted" } }),
      })
    })

    await expect(page.getByRole("button", { name: /accept/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /accept/i }).click()

    // After accepting, the item should change to "started following you"
    await expect(
      page.getByText(/started following you/i)
    ).toBeVisible({ timeout: 5_000 })

    // Verify the correct payload was sent
    expect(capturedBody).toMatchObject({ requestId: "req-abc-123", action: "accept" })
  })
})

// ─── Follow request — Decline ────────────────────────────────────────────────

test.describe("NotificationsWidget — decline follow request", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [MOCK_FOLLOW_REQUEST_NOTIFICATION] }),
      })
    })
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.route("/api/social/follow/respond", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ request: { id: "req-abc-123", status: "rejected" } }),
      })
    })
    await page.goto("/dashboard")
  })

  test("clicking Decline removes the follow request from the list", async ({ page }) => {
    await expect(page.getByRole("button", { name: /decline/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /decline/i }).click()

    // After decline, the "wants to follow you" row should be gone
    await expect(
      page.getByText(/wants to follow you/i)
    ).not.toBeVisible({ timeout: 5_000 })
  })
})

// ─── Other notification types ─────────────────────────────────────────────────

test.describe("NotificationsWidget — other notification types", () => {
  test("renders new_follower notification", async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [MOCK_NEW_FOLLOWER_NOTIFICATION] }),
      })
    })
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.goto("/dashboard")

    await expect(page.getByText("Basil Greene")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/started following you/i)).toBeVisible()
  })

  test("renders post_like notification with post title", async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [MOCK_POST_LIKE_NOTIFICATION] }),
      })
    })
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.goto("/dashboard")

    await expect(page.getByText("Cheddar Block")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/liked your post/i)).toBeVisible()
    await expect(page.getByText(/Truffle Pasta/i)).toBeVisible()
  })

  test("renders post_repost notification with post title", async ({ page }) => {
    await page.route("/api/social/notifications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [MOCK_POST_REPOST_NOTIFICATION] }),
      })
    })
    await page.route("/api/social/friends-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ following: [], followerCount: 0, followingCount: 0 }),
      })
    })
    await page.goto("/dashboard")

    await expect(page.getByText("Saffron Twist")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/reposted/i)).toBeVisible()
    await expect(page.getByText(/Miso Ramen/i)).toBeVisible()
  })
})

// ─── Notifications API ────────────────────────────────────────────────────────

test.describe("GET /api/social/notifications API", () => {
  test("returns 200 with a notifications array", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/notifications")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.notifications)).toBe(true)
  })

  test("notification objects have required fields", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/notifications")
    expect(res.status()).toBe(200)
    const body = await res.json()

    for (const n of body.notifications) {
      expect(n).toHaveProperty("type")
      expect(["follow_request", "new_follower", "post_like", "post_repost"]).toContain(n.type)
      expect(n).toHaveProperty("from")
      expect(n).toHaveProperty("created_at")
    }
  })

  test("follow_request notifications include requestId", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/social/notifications")
    const body = await res.json()
    const requests = body.notifications.filter(
      (n: { type: string }) => n.type === "follow_request"
    )
    for (const r of requests) {
      expect(r).toHaveProperty("requestId")
    }
  })
})
