import { test, expect } from "@playwright/test";

test("optional toolbar progress follows pages, spreads and continuous fullscreen scrolling", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Pages at dusk");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  const progress = page.getByRole("progressbar", {
    name: "Chapter reading progress",
  });
  await expect(progress).toHaveCount(0);
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Show reading progress")).not.toBeChecked();
  await page.getByLabel("Show reading progress").check();
  await page.getByLabel("Animate page turns").uncheck();
  await page.getByLabel("Margins").selectOption("relaxed");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  const prose =
    "নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে এসে দাঁড়াল। ".repeat(180);
  await page.getByRole("textbox", { name: "Edit paragraph P1" }).fill(prose);
  await page.locator(".paper-heading").click();
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const picker = page.getByLabel("Go to page");
  await expect.poll(() => picker.locator("option").count()).toBeGreaterThan(3);
  const first = Number(await progress.getAttribute("aria-valuenow"));
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(100);
  const toolbar = (await page.locator(".reading-toolbar").boundingBox())!;
  const bar = (await progress.boundingBox())!;
  expect(toolbar.height).toBe(44);
  const preferences = page.getByLabel("Reading settings");
  await expect(preferences).toHaveCSS("border-top-width", "0px");
  const preferencesBox = (await preferences.boundingBox())!;
  expect(preferencesBox.y - toolbar.y).toBeGreaterThanOrEqual(6);
  expect(
    bar.y - preferencesBox.y - preferencesBox.height,
  ).toBeGreaterThanOrEqual(4);

  expect(bar.x).toBeCloseTo(toolbar.x, 1);
  expect(bar.width).toBeCloseTo(toolbar.width, 1);
  expect(bar.height).toBe(2);
  expect(bar.y + bar.height).toBeCloseTo(toolbar.y + toolbar.height, 1);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeGreaterThan(first);
  const last = await picker.locator("option").last().getAttribute("value");
  await picker.selectOption({ value: last! });
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await page.getByLabel("Reading layout").selectOption("spread");
  if (info.project.name === "desktop")
    await expect(progress).toHaveAttribute("aria-valuetext", /^Page 1–2 of/);
  else await expect(progress).toHaveAttribute("aria-valuetext", /^Page 1 of/);
  await page.screenshot({
    path: `test-results/${info.project.name}-reader-progress.png`,
  });
  await page.getByLabel("Reading layout").selectOption("continuous");
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await page.locator(".book-reader").evaluate((el) => (el.scrollTop = 0));
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeLessThan(100);
  const initialScroll = Number(await progress.getAttribute("aria-valuenow"));
  await page
    .locator(".book-reader")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  expect(initialScroll).toBeLessThan(100);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Show reading progress")).toBeChecked();
  await page.getByLabel("Show reading progress").uncheck();
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(progress).toHaveCount(0);
  await expect(page.locator(".reading-text p")).toHaveText(prose.trim());
});
