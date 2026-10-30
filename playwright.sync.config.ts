import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 240000,
  testDir: "./tests/e2e",
  testMatch: "**/differential.protocol.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
    },
    {
      command: "node scripts/serve-sync-fixture.mjs",
      url: "http://127.0.0.1:18084/api/session",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
