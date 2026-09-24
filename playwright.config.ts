import { defineConfig } from "@playwright/test";

// Browser tests of the real app. Needs the UI built first: pnpm --filter @vigia/ui build.
// PW_CHROMIUM points at an already installed Chromium instead of Playwright's own download.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    browserName: "chromium",
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
