import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/legacy/**", "**/pages/**"],
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
