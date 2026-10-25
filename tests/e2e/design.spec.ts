import { test, expect } from "@playwright/test";
test("library navigation and empty chapter tools offer relevant actions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No manuscripts yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Chapter workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Read", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-empty-library.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await expect(
    page.getByRole("heading", { name: "Settings & connections" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Khosra library" }).click();
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("নদীর ওপারে");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(
    page.getByRole("heading", { name: "This chapter is empty" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Paste chapter text" }),
  ).toBeEnabled();
  const nav = page.getByRole("navigation", { name: "Chapter workspace" });
  await nav.getByRole("button", { name: "Flags", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No flags yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flag chapter", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav.getByRole("button", { name: "Proposals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No proposals yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import proposal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No earlier revisions" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Context", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No context index yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy reindex request", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-empty-context.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open manuscript", exact: true })
    .click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("নদীর ওপারে আলো জ্বলছিল।");
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.getByRole("link", { name: "Khosra library" }).click();
  await expect(
    page.getByRole("button", { name: "Open নদীর ওপারে", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New manuscript", exact: true })
    .click();
  await page.getByLabel("Working title").fill("Notes at dusk");
  await page.getByLabel("Manuscript language").selectOption("en");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("link", { name: "Khosra library" }).click();
  await expect(page.locator(".library-book")).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "Chapter workspace" }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-library.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open নদীর ওপারে", exact: true })
    .click();
  await expect(page.locator(".paper")).toContainText("নদীর ওপারে আলো জ্বলছিল।");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("complementary", { name: "Chapter contents" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close contents" }).click();
  await expect(
    page.getByRole("complementary", { name: "Chapter contents" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
