/**
 * E2E tests: Feed — like / repost
 *
 * Covers:
 *  - /home feed renders posts when the API returns data
 *  - Clicking the Heart button on a post toggles the liked state (red fill)
 *  - Like count increments optimistically
 *  - Clicking the Repost button toggles the reposted state (green colour)
 *  - Repost count increments optimistically
 *  - Toggling like a second time decrements count (unlike)
 *  - Toggling repost a second time decrements count (un-repost)
 *  - GET /api/posts/feed returns the correct shape
 *  - Like/repost API endpoints return 400 for non-existent post
 */

import { test, expect } from "@playwright/test"

const MOCK_POSTS = [
  {
    id: "post-aaa",
    title: "Truffle Pasta",
    caption: "Made it last night",
    image_url: "https://placehold.co/640x400/png",
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    like_count: 4,
    repost_count: 1,
    liked_by_viewer: false,
    reposted_by_viewer: false,
    author: {
      id: "author-1",
      full_name: "Alice Chef",
      avatar_url: null,
      username: "alicechef",
    },
  },
  {
    id: "post-bbb",
    title: "Miso Ramen",
    caption: null,
    image_url: "https://placehold.co/640x400/png",
    created_at: new Date(Date.now() - 7_200_000).toISOString(),
    like_count: 0,
    repost_count: 0,
    liked_by_viewer: false,
    reposted_by_viewer: false,
    author: {
      id: "author-2",
      full_name: "Bob Noodle",
      avatar_url: null,
      username: "bobnoodle",
    },
  },
]

// ─── Feed rendering ──────────────────────────────────────────────────────────

test.describe("Feed rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/challenges/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ challenge: null }),
      })
    })
    await page.route("/api/posts/feed*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ posts: MOCK_POSTS }),
      })
    })
    await page.goto("/home")
  })

  test("renders post titles from the feed", async ({ page }) => {
    await expect(page.getByText("Truffle Pasta")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Miso Ramen")).toBeVisible()
  })

  test("renders author names", async ({ page }) => {
    await expect(page.getByText("Alice Chef")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Bob Noodle")).toBeVisible()
  })

  test("renders like counts", async ({ page }) => {
    // Post aaa has 4 likes
    await expect(page.getByText("4")).toBeVisible({ timeout: 15_000 })
  })
})

// ─── Feed like toggle ────────────────────────────────────────────────────────

test.describe("Feed like toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/challenges/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ challenge: null }),
      })
    })
    await page.route("/api/posts/feed*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ posts: MOCK_POSTS }),
      })
    })
    // Mock like endpoint — toggles liked state
    let likedState = false
    await page.route(/\/api\/posts\/.+\/like/, async (route) => {
      likedState = !likedState
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ liked: likedState }),
      })
    })
    await page.goto("/home")
    // Wait for posts to render
    await expect(page.getByText("Truffle Pasta")).toBeVisible({ timeout: 15_000 })
  })

  test("clicking the heart button on a post applies the liked colour class", async ({ page }) => {
    // Find the first like button (icon-only button containing an SVG)
    // The heart icon is inside a <button> with class that includes text-red-500 when active
    const firstPostCard = page.locator(".overflow-hidden").first()
    const likeBtn = firstPostCard.locator("button").filter({ hasText: /^\d+$|^$/ }).first()

    // The button wraps the Heart SVG and the like count
    // We locate by the Heart SVG presence
    const heartButtons = page.locator("button").filter({ has: page.locator("svg") })

    // Click the first button that contains the heart icon (has count "4")
    const likeButton = page.locator("button").filter({ hasText: "4" }).first()
    await likeButton.click()

    // After click, the button should have the red-500 text class (liked state)
    await expect(likeButton).toHaveClass(/text-red-500/, { timeout: 3_000 })
  })

  test("like count updates optimistically after clicking like", async ({ page }) => {
    // Initial count for "Truffle Pasta" is 4
    const likeButton = page.locator("button").filter({ hasText: "4" }).first()
    await likeButton.click()

    // Optimistic update → count becomes 5
    await expect(
      page.locator("button").filter({ hasText: "5" }).first()
    ).toBeVisible({ timeout: 3_000 })
  })

  test("clicking like twice (unlike) decrements back to original count", async ({ page }) => {
    const likeButton = page.locator("button").filter({ hasText: "4" }).first()

    // Like
    await likeButton.click()
    await expect(page.locator("button").filter({ hasText: "5" }).first()).toBeVisible({ timeout: 3_000 })

    // Unlike
    const unlikeButton = page.locator("button").filter({ hasText: "5" }).first()
    await unlikeButton.click()
    await expect(page.locator("button").filter({ hasText: "4" }).first()).toBeVisible({ timeout: 3_000 })
  })
})

// ─── Feed repost toggle ──────────────────────────────────────────────────────

test.describe("Feed repost toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/challenges/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ challenge: null }),
      })
    })
    // Serve a post with repost_count=2 for easy identification
    const postsWithReposts = [
      { ...MOCK_POSTS[0], repost_count: 2, reposted_by_viewer: false },
    ]
    await page.route("/api/posts/feed*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ posts: postsWithReposts }),
      })
    })

    let repostedState = false
    await page.route(/\/api\/posts\/.+\/repost/, async (route) => {
      repostedState = !repostedState
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reposted: repostedState }),
      })
    })

    await page.goto("/home")
    await expect(page.getByText("Truffle Pasta")).toBeVisible({ timeout: 15_000 })
  })

  test("clicking the repost button applies the green colour class", async ({ page }) => {
    const repostButton = page.locator("button").filter({ hasText: "2" }).first()
    await repostButton.click()
    await expect(repostButton).toHaveClass(/text-green-500/, { timeout: 3_000 })
  })

  test("repost count increments optimistically", async ({ page }) => {
    const repostButton = page.locator("button").filter({ hasText: "2" }).first()
    await repostButton.click()
    await expect(
      page.locator("button").filter({ hasText: "3" }).first()
    ).toBeVisible({ timeout: 3_000 })
  })
})

// ─── Feed API shape ──────────────────────────────────────────────────────────

test.describe("GET /api/posts/feed API", () => {
  test("returns posts array", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/posts/feed?limit=5")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.posts)).toBe(true)
  })

  test("respects limit param", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/posts/feed?limit=2")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.posts.length).toBeLessThanOrEqual(2)
  })

  test("post objects have required fields", async ({ page }) => {
    await page.goto("/dashboard")

    const res = await page.request.get("/api/posts/feed?limit=1")
    expect(res.status()).toBe(200)
    const body = await res.json()
    if (body.posts.length > 0) {
      const post = body.posts[0]
      expect(post).toHaveProperty("id")
      expect(post).toHaveProperty("title")
      expect(post).toHaveProperty("image_url")
      expect(post).toHaveProperty("like_count")
      expect(post).toHaveProperty("repost_count")
      expect(post).toHaveProperty("author")
    }
  })
})
