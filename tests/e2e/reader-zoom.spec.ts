import { test, expect } from "@playwright/test";
test("fullscreen zoom fits the paper and persists independently from normal reading", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Paper by the river");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  await page
    .getByLabel("Chapter text", { exact: true })
    .fill(
      Array.from(
        { length: 60 },
        (_, i) =>
          `[${i + 1}] নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে এসে দাঁড়াল।`,
      ).join("\n\n"),
    );
  await page.getByRole("button", { name: "Save as a new revision" }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByLabel("Reading layout").selectOption("spread");
  await page.evaluate(() => document.fonts.ready);
  const sheet = page.locator(".reading-sheet"),
    text = page.locator(".reading-text");
  const normal = (await sheet.boundingBox())!;
  const paper = await text.evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
    overflow: el.scrollWidth,
    font: getComputedStyle(el).fontSize,
  }));
  const total = await page.getByLabel("Go to page").locator("option").count();
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return (
        b.y >= 0 &&
        b.y + b.height <= (await page.evaluate(() => innerHeight)) - 40
      );
    })
    .toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-fullscreen-fit.png`,
  });
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Fullscreen zoom")).toHaveValue("page");
  await page.getByLabel("Fullscreen zoom").selectOption("width");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  const wide = (await sheet.boundingBox())!;
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Fullscreen zoom").selectOption("100");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  const hundred = (await sheet.boundingBox())!;
  await expect
    .poll(() =>
      page
        .locator(".book-reader")
        .evaluate((el) => el.scrollHeight - el.clientHeight),
    )
    .toBeLessThanOrEqual(1);
  for (const name of ["Previous chapter", "Next chapter"]) {
    const bounds = (await page
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      await page.evaluate(() => innerHeight),
    );
  }
  if (info.project.name === "desktop") {
    const chapter = (await page.locator(".reader-navigation").boundingBox())!;
    const picker = (await page.locator(".page-navigation").boundingBox())!;
    expect(chapter.y).toBeCloseTo(picker.y, 1);
  }

  expect(hundred.y + hundred.height).toBeLessThanOrEqual(
    (await page.evaluate(() => innerHeight)) - 40,
  );
  expect(hundred.y).toBeGreaterThanOrEqual(
    (await page.locator(".reading-toolbar").boundingBox())!.y +
      (await page.locator(".reading-toolbar").boundingBox())!.height,
  );
  await page.locator(".reading-toolbar").evaluate((el) => {
    const root = el.closest(".book-reader")!;
    const stage = root.querySelector(".reading-stage")!;
    const paper = root.querySelector(".reading-sheet")!;
    const usable =
      root.clientHeight -
      (stage.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop) -
      (root.querySelector(".reader-navigation")!.getBoundingClientRect()
        .bottom -
        root.querySelector(".reading-paper-frame")!.getBoundingClientRect()
          .bottom) -
      parseFloat(getComputedStyle(root).paddingBottom) -
      1;
    // On tall phones the width constrains the sheet before the height does.
    el.style.minHeight = `${el.getBoundingClientRect().height + usable - paper.getBoundingClientRect().height + 80}px`;
  });
  await expect
    .poll(async () => (await sheet.boundingBox())!.height)
    .toBeLessThan(hundred.height);
  const tallerHeader = (await sheet.boundingBox())!;
  expect(tallerHeader.y + tallerHeader.height).toBeLessThanOrEqual(
    (await page.evaluate(() => innerHeight)) - 40,
  );
  await page
    .locator(".reading-toolbar")
    .evaluate((el) => el.style.removeProperty("min-height"));
  await expect
    .poll(async () => (await sheet.boundingBox())!.height)
    .toBeCloseTo(hundred.height, 1);
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Fullscreen zoom").selectOption("75");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  const usable = await page.locator(".book-reader").evaluate((el) => {
    const stage = el.querySelector(".reading-stage")!;
    return (
      el.clientHeight -
      (stage.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop) -
      (el.querySelector(".reader-navigation")!.getBoundingClientRect().bottom -
        el.querySelector(".reading-paper-frame")!.getBoundingClientRect()
          .bottom) -
      parseFloat(getComputedStyle(el).paddingBottom) -
      1
    );
  });
  expect((await sheet.boundingBox())!.height).toBeCloseTo(usable * 0.75, 1);
  expect(
    await text.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      overflow: el.scrollWidth,
      font: getComputedStyle(el).fontSize,
    })),
  ).toEqual(paper);
  expect(await page.getByLabel("Go to page").locator("option").count()).toBe(
    total,
  );
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect
    .poll(async () => (await sheet.boundingBox())!.width)
    .toBeCloseTo(normal.width, 1);
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Fullscreen zoom")).toHaveValue("75");
  await page.getByLabel("Fullscreen zoom").selectOption("width");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  expect((await sheet.boundingBox())!.width).toBeCloseTo(wide.width, 1);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect
    .poll(async () => (await sheet.boundingBox())!.width)
    .toBeCloseTo(normal.width, 1);
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Fullscreen zoom")).toHaveValue("width");
  await page.getByLabel("Fullscreen zoom").selectOption("page");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.evaluate(() =>
    Object.defineProperty(
      document.querySelector(".book-reader"),
      "requestFullscreen",
      { value: undefined, configurable: true },
    ),
  );
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.getByRole("status")).toContainText("window-filling");
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return (
        b.y >= 0 &&
        b.y + b.height <= (await page.evaluate(() => innerHeight)) - 40
      );
    })
    .toBe(true);
});
