import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 60000,
  testDir: "./tests/e2e",
  testMatch: "**/*.server.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:5180", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm exec vite preview -- --host 127.0.0.1 --port 5180",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
  },
});
