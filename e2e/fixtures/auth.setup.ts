/**
 * Auth setup for Playwright E2E tests.
 *
 * Logs in once using test credentials and saves the session state to
 * e2e/.auth/user.json so all tutorial smoke tests can reuse it.
 *
 * Required environment variables (set in .env.test.local or CI secrets):
 *   E2E_TEST_EMAIL    — email of a pre-created test account
 *   E2E_TEST_PASSWORD — password for that account
 */

import { test as setup, expect } from "@playwright/test"
import path from "node:path"

const AUTH_FILE = path.join(__dirname, "../.auth/user.json")

setup("authenticate", async ({ page }) => {
  await page.goto("/auth/signin")

  // Fill credentials
  await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL ?? "")
  await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD ?? "")
  await page.getByRole("button", { name: /sign in|log in|continue/i }).click()

  // Wait for redirect to dashboard (Clerk redirects after successful sign-in)
  await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/(dashboard|welcome)/)

  // Persist cookies and localStorage so tests can skip the login flow
  await page.context().storageState({ path: AUTH_FILE })
})
