import { defineConfig, devices } from "@playwright/test";

/**
 * Public-site end-to-end tests. They run against an already running stack
 * (Compose locally and in CI) that has been migrated and seeded with
 * `backend/scripts/seed_e2e.py`. Set E2E_BASE_URL to target another origin.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
      testMatch: /(public|keyboard|security)\.spec\.ts/,
    },
  ],
});
