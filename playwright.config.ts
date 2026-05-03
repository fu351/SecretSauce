import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"

// Load .env.local so E2E_TEST_EMAIL, E2E_TEST_PASSWORD, and E2E_TARGET_USERNAME
// are available without any wrapper command.
config({ path: ".env.local" })

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  webServer: {
    command: process.env.E2E_WEB_SERVER_COMMAND ?? "npm run dev",
    url: "http://localhost:3000/manifest.webmanifest",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    // Auth setup runs first — saves session to e2e/.auth/user.json
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    // Public tutorial checks do not need Clerk auth; keep these runnable in local dev.
    {
      name: "tutorial-public",
      testMatch: /e2e\/tutorial\/highlighting\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: undefined },
    },
    // Tutorial smoke tests depend on auth setup
    {
      name: "tutorial",
      testMatch: /e2e\/tutorial\/(?!highlighting).*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
    // Main-flow QA tests — signup/username, social, posts, feed, recipes, notifications, challenges
    {
      name: "flows",
      testMatch: /e2e\/flows\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
})
