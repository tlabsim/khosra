import { test, expect } from "@playwright/test";

for (const origin of [
  "https://writer.example.test",
  "https://drafts.example.org:8443",
]) {
  test(`connection URL and API requests follow ${origin}`, async ({ page, baseURL }) => {
    const apiRequests: string[] = [];
    await page.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/")) {
        apiRequests.push(url.href);
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Owner session required." }),
        });
        return;
      }
      const response = await route.fetch({
        url: new URL(url.pathname + url.search, baseURL).href,
      });
      await route.fulfill({ response });
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copied = text;
          },
        },
      });
    });
    await page.goto(origin);
    await page.getByRole("button", { name: "Settings & backups" }).click();
    await expect(page.locator(".settings-endpoint code")).toHaveText(
      `${origin}/api/mcp`,
    );
    await page.getByRole("button", { name: "Copy connection URL" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied",
      `${origin}/api/mcp`,
    );
    await page.getByLabel("Owner password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect.poll(() => apiRequests.includes(`${origin}/api/login`)).toBe(true);
    expect(apiRequests.every((url) => new URL(url).origin === origin)).toBe(true);
  });
}
