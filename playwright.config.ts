import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    storageState: "e2e/.auth/user.json",
  },

  projects: [
    // Auth setup runs first — saves session to e2e/.auth/user.json
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    // Tutorial smoke tests depend on auth setup
    {
      name: "tutorial",
      testMatch: /e2e\/tutorial\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
