/**
 * Auth setup for Playwright E2E tests.
 *
 * Logs in once using test credentials and saves the session state to
 * e2e/.auth/user.json so all tutorial smoke tests can reuse it.
 *
 * Required environment variables (set in .env.test.local or CI secrets):
 *   E2E_TEST_EMAIL    — email of a pre-created test account
 *   E2E_TEST_PASSWORD — password for that account
 *   E2E_TEST_MFA_CODE — optional second-factor code; Clerk test emails can use 424242
 */

import { test as setup, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const AUTH_FILE = path.join(__dirname, "../.auth/user.json")
const CLERK_TEST_EMAIL_PATTERN = /\+clerk_test@/i
const POST_SIGN_IN_PATH_PATTERN = /\/(dashboard|welcome)/

setup.use({ storageState: undefined })

async function waitForRedirectOrSecondFactor(page: Page) {
  const verificationCodeInput = page.getByLabel(/verification code|backup code/i)
  const signOutButton = page.getByRole("button", { name: /sign out/i })
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    if (POST_SIGN_IN_PATH_PATTERN.test(page.url())) {
      return { state: "redirected" as const, verificationCodeInput }
    }

    if (await verificationCodeInput.isVisible().catch(() => false)) {
      return { state: "mfa" as const, verificationCodeInput }
    }

    if (await signOutButton.isVisible().catch(() => false)) {
      return { state: "authenticated" as const, verificationCodeInput }
    }

    await page.waitForTimeout(250)
  }

  return { state: "pending" as const, verificationCodeInput }
}

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  await page.goto("/auth/signin")

  // Fill credentials
  await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL ?? "")
  await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD ?? "")
  const signInButton = page.getByRole("button", { name: "Sign In", exact: true })
  await expect(signInButton).toBeEnabled()
  await signInButton.click()

  const { state, verificationCodeInput } = await waitForRedirectOrSecondFactor(page)

  if (state === "mfa") {
    const fallbackMfaCode = CLERK_TEST_EMAIL_PATTERN.test(process.env.E2E_TEST_EMAIL ?? "")
      ? "424242"
      : null
    const mfaCode = process.env.E2E_TEST_MFA_CODE ?? fallbackMfaCode

    if (!mfaCode) {
      throw new Error(
        "Sign-in requires a second-factor code. Set E2E_TEST_MFA_CODE or use a Clerk +clerk_test email.",
      )
    }

    await verificationCodeInput.fill(mfaCode)
    const verifyButton = page.getByRole("button", { name: /verify & sign in/i })
    await expect(verifyButton).toBeEnabled()
    await verifyButton.click()
  }

  const signOutButton = page.getByRole("button", { name: /sign out/i })
  await expect
    .poll(async () => {
      if (POST_SIGN_IN_PATH_PATTERN.test(page.url())) return "redirected"
      if (await signOutButton.isVisible().catch(() => false)) return "authenticated"
      return "pending"
    }, { timeout: 30_000 })
    .toMatch(/redirected|authenticated/)

  if (!POST_SIGN_IN_PATH_PATTERN.test(page.url())) {
    await page.goto("/dashboard")
  }

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

  // Persist cookies and localStorage so tests can skip the login flow
  await page.context().storageState({ path: AUTH_FILE })
})
