import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 60000,
  testDir: "./tests/e2e",
  testIgnore: "**/*.server.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
