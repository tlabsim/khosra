import { test, expect } from "@playwright/test";
test("paper formats and margins reflow text within fixed trim proportions", async ({
  page,
}, info) => {
  await page.addInitScript(
    () =>
      !localStorage.getItem("khosra-reader") &&
      localStorage.setItem(
        "khosra-reader",
        JSON.stringify({ lines: 14, size: 11 }),
      ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Pages by the river");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  const paragraphs = Array.from(
    { length: 80 },
    (_, i) =>
      `[${i + 1}] নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে এসে দাঁড়াল। মাঠে বৃষ্টির পানি জমেছে।`,
  );
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  await page
    .getByLabel("Chapter text", { exact: true })
    .fill(paragraphs.join("\n\n"));
  await page.getByRole("button", { name: "Save as a new revision" }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const sheet = page.locator(".reading-sheet"),
    text = page.locator(".reading-text");
  const box = async () => (await sheet.boundingBox())!;
  const original = await box();
  expect(original.width / original.height).toBeCloseTo(6 / 9, 3);
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Page format")).toHaveValue("paperback");
  await expect(page.getByLabel("Margins")).toHaveValue("normal");
  await expect(page.getByText("Lines per page", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Increase text size" }).click();
  await page.getByLabel("Line spacing").selectOption("2.2");
  expect((await box()).height).toBeCloseTo(original.height, 1);
  expect((await box()).width).toBeCloseTo(original.width, 1);
  const heights: number[] = [];
  for (const margins of ["tight", "normal", "relaxed"]) {
    await page.getByLabel("Margins").selectOption(margins);
    expect((await box()).height).toBeCloseTo(original.height, 1);
    heights.push(await text.evaluate((el) => el.clientHeight));
  }
  expect(heights[0]).toBeGreaterThan(heights[1]);
  expect(heights[1]).toBeGreaterThan(heights[2]);
  for (const [format, ratio] of [
    ["digest", 5.5 / 8.5],
    ["a5", 148 / 210],
    ["paperback", 6 / 9],
  ] as const) {
    await page.getByLabel("Page format").selectOption(format);
    expect((await box()).width / (await box()).height).toBeCloseTo(ratio, 3);
  }
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.getByLabel("Reading layout").selectOption("spread");
  const sides = info.project.name === "desktop" ? 2 : 1;
  expect((await box()).width / sides / (await box()).height).toBeCloseTo(
    6 / 9,
    3,
  );
  const lineLayout = () =>
    text.evaluate((el) => {
      const scale = new DOMMatrix(
        getComputedStyle(el.closest(".reading-sheet")!).transform,
      ).a;
      const range = document.createRange();
      range.selectNodeContents(el);
      return Array.from(range.getClientRects()).map((r) => [
        r.width / scale,
        r.height / scale,
      ]);
    });
  const beforeLines = await lineLayout();
  const beforePageCount = await page
    .getByLabel("Go to page")
    .locator("option")
    .count();
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.locator(".book-reader")).toHaveClass(/is-immersive/);
  await expect
    .poll(async () => {
      const b = await box();
      return Math.abs(b.width / sides / b.height - 6 / 9);
    })
    .toBeLessThan(0.001);
  expect(await page.getByLabel("Go to page").locator("option").count()).toBe(
    beforePageCount,
  );
  const afterLines = await lineLayout();
  expect(afterLines.length).toBe(beforeLines.length);
  for (let i = 0; i < afterLines.length; i++) {
    expect(afterLines[i][0]).toBeCloseTo(beforeLines[i][0], 1);
    expect(afterLines[i][1]).toBeCloseTo(beforeLines[i][1], 1);
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-paperback.png`,
  });
  const picker = page.getByLabel("Go to page");
  await picker.selectOption({
    index: (await picker.locator("option").count()) - 1,
  });
  await expect
    .poll(() =>
      text
        .locator("p")
        .last()
        .evaluate((el) => {
          const range = document.createRange();
          const node = el.lastChild!;
          range.setStart(node, node.textContent!.length - 1);
          range.setEnd(node, node.textContent!.length);
          const r = range.getBoundingClientRect(),
            v = el.closest(".reading-viewport")!.getBoundingClientRect();
          return (
            r.left >= v.left - 1 &&
            r.right <= v.right + 1 &&
            r.top >= v.top - 1 &&
            r.bottom <= v.bottom + 1
          );
        }),
    )
    .toBe(true);
  await expect(text.locator("p")).toHaveText(paragraphs);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  expect(await page.getByLabel("Go to page").locator("option").count()).toBe(
    beforePageCount,
  );
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Page format")).toHaveValue("paperback");
  await expect(page.getByLabel("Margins")).toHaveValue("relaxed");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.getByLabel("Reading layout").selectOption("continuous");
  expect(await text.locator("p").count()).toBe(80);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
