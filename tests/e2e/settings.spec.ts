import { test, expect } from "@playwright/test";
import { checkPasswordReveal } from "./password";
test("settings returns to the previous view and keeps connection and backup actions usable", async ({
  page,
}, info) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Settings & backups" });
  await settings.click();
  await expect(
    page.getByRole("heading", { name: "Settings & connections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export this book as text" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(
    page.getByRole("heading", { name: "No manuscripts yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Evening pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("navigation", { name: "Chapter workspace" })
    .getByRole("button", { name: "Flags", exact: true })
    .click();
  await settings.click();
  await expect(
    page.getByRole("button", { name: "Read", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload local workspace" }),
  ).toBeDisabled();
  await expect(page.locator(".settings-export-title")).toHaveText(
    "Evening pages",
  );
  await page.getByText("How to connect", { exact: true }).click();
  await expect(
    page.getByText(
      "Choose OAuth and sign in with your Khosra owner password.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".desk-header")).not.toHaveClass(/is-scrolled/);
  await page.screenshot({
    path: `test-results/${info.project.name}-settings.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "No flags yet" }),
  ).toBeVisible();
  await settings.click();
  await settings.click();
  await expect(
    page.getByRole("heading", { name: "No flags yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  // The mobile reader intentionally hides secondary masthead actions.
  if (info.project.name === "desktop") {
    await settings.click();
    await page.getByRole("button", { name: "Back to reading" }).click();
    await expect(page.locator(".book-reader")).toBeVisible();
  }
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await settings.click();
  await page.route("**/api/login", (route) =>
    route.fulfill({ json: { csrf: "synthetic-csrf" } }),
  );
  await checkPasswordReveal(page, "Owner password", "synthetic-test-password");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".settings-connection-state")).toHaveText(
    "Connected",
  );
  await expect(page.getByLabel("Owner password")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload local workspace" }),
  ).toBeEnabled();
  await page.route("**/api/logout", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByLabel("Owner password")).toHaveValue("");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download full archive" }).click();
  expect((await download).suggestedFilename()).toContain("khosra");
});

test("prototype exports cannot replace the current workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Keep this manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await page.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = new DataTransfer();
    files.items.add(
      new File(
        [
          JSON.stringify({
            app: "Khosra",
            chapters: [
              { id: 1, title: "Prototype chapter", content: "Old text" },
            ],
            versions: {},
            notes: [],
          }),
        ],
        "prototype.json",
        { type: "application/json" },
      ),
    );
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("alert")).toContainText(
    "Archive is damaged or unsupported. Nothing was imported.",
  );
  await expect(page.locator(".settings-export-title")).toHaveText(
    "Keep this manuscript",
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await expect(page.locator(".settings-export-title")).toHaveText(
    "Keep this manuscript",
  );
});
