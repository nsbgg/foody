import { defineConfig } from "@playwright/test";
// Use the locally installed Edge by default. CI installs Playwright Chromium.
const browser = process.env.PLAYWRIGHT_BROWSER || "msedge";
if (!["msedge", "chromium"].includes(browser)) {
  throw new Error("PLAYWRIGHT_BROWSER must be msedge or chromium");
}
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3002",
    browserName: "chromium",
    ...(browser === "msedge" ? { channel: "msedge" } : {}),
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.ts",
    url: "http://localhost:3002/api/health",
    env: { PORT: "3002", DATA_DIR: "test-results/server-data" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
