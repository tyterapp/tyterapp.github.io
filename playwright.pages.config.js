import { defineConfig } from "@playwright/test";
const previewUrl = `http://127.0.0.1:${Number(process.env.TYTER_PREVIEW_PORT || 4181)}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/pages/*.spec.js", "**/web-pro.spec.js"],
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: [["list"]],
  use: {
    baseURL: previewUrl,
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run site:github:preview",
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
