import { test, expect } from "@playwright/test";
test("reader preferences, side navigation, selection, references and fullscreen", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Reading at dusk");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  const prose =
    "নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে এসে দাঁড়াল। ".repeat(100);
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page.getByRole("textbox", { name: "Edit paragraph P1" }).fill(prose);
  await page.locator(".paper-heading").click();
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const next = page.getByRole("button", { name: "Next page", exact: true });
  const prev = page.getByRole("button", { name: "Previous page", exact: true });
  const sheet = await page.locator(".reading-sheet").boundingBox();
  const nextBox = await next.boundingBox(),
    prevBox = await prev.boundingBox();
  if (info.project.name === "desktop") {
    expect(nextBox!.x).toBeGreaterThanOrEqual(sheet!.x + sheet!.width);
    expect(prevBox!.x + prevBox!.width).toBeLessThanOrEqual(sheet!.x);
    expect(nextBox!.y).toBeLessThan(sheet!.y + sheet!.height);
  } else expect(nextBox!.y).toBeGreaterThanOrEqual(sheet!.y + sheet!.height);
  // A rapid second turn waits for the current physical leaf rather than replacing it.
  const sameLeaf = await page.evaluate(async () => {
    const next = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Next page"]',
    )!;
    next.click();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const scene = document.querySelector(".page-turn-scene");
    next.click();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    return !!scene && scene === document.querySelector(".page-turn-scene");
  });
  expect(sameLeaf).toBe(true);
  await expect(page.getByLabel("Go to page")).toHaveValue("2");
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page.getByLabel("Go to page").selectOption("0");
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  const dragText = async () => {
    const line = await page.locator(".reading-text p").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getClientRects()[0];
      return {
        x: rect.left + 3,
        y: rect.top + rect.height / 2,
        to: Math.min(rect.right - 3, rect.left + 140),
      };
    });
    await page.mouse.move(line.x, line.y);
    await page.mouse.down();
    await page.mouse.move(line.to, line.y, { steps: 8 });
    await page.mouse.up();
  };
  if (info.project.name === "desktop") {
    await dragText();
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length || 0),
    ).toBeGreaterThan(0);
  }
  await page.getByLabel("Reading settings").click();
  const prefs = page.getByRole("dialog", { name: "Reader preferences" });
  await expect(
    prefs.getByRole("heading", { name: "Typography" }),
  ).toBeVisible();
  await expect(
    prefs.getByRole("heading", { name: "Paper", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Text selectable")).toBeChecked();
  await page.getByLabel("Show paragraph IDs").check();
  await page.getByLabel("Text selectable").uncheck();
  await page.getByRole("radio", { name: "Sepia", exact: true }).check();
  await page.getByLabel("Paper texture").selectOption("grain");
  await expect(
    prefs.getByRole("switch", { name: "Text selectable", exact: true }),
  ).not.toBeChecked();
  await expect(
    prefs.getByRole("switch", { name: "Show paragraph IDs", exact: true }),
  ).toBeChecked();
  if (info.project.name === "desktop") {
    const color = await prefs
      .getByRole("radiogroup", { name: "Page color" })
      .boundingBox();
    const texture = await prefs.getByLabel("Paper texture").boundingBox();
    expect(color!.y).toBeCloseTo(texture!.y, 1);
    expect(color!.height).toBeCloseTo(texture!.height, 1);
  }
  if (info.project.name === "desktop") {
    expect(await prefs.evaluate((el) => el.clientWidth)).toBeGreaterThan(700);
    expect(
      await page
        .locator(".reader-preferences-body")
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
  }
  const dialogBox = await prefs.boundingBox();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(12);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
    (await page.evaluate(() => innerHeight)) - 11,
  );
  expect(
    await prefs.evaluate((el) => (el as HTMLDialogElement).matches(":modal")),
  ).toBe(true);

  await expect(page.locator(".reading-text")).toHaveCSS("user-select", "none");
  expect(
    await page
      .locator(".reading-text p")
      .evaluate((el) => getComputedStyle(el, "::before").content),
  ).toBe('"P1"');
  await expect(page.locator(".reading-text p")).toHaveText(prose.trim());
  await page.screenshot({
    path: `test-results/${info.project.name}-reader-preferences.png`,
  });
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(prefs).toHaveCount(0);
  await expect(page.getByLabel("Reading settings")).toBeFocused();
  await page.getByLabel("Reading settings").click();
  await page.mouse.click(2, 2);
  await expect(prefs).toHaveCount(0);
  await expect(page.getByLabel("Reading settings")).toBeFocused();

  if (info.project.name === "desktop") {
    await dragText();
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length || 0),
    ).toBe(0);
  }

  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.locator(".book-reader")).toHaveClass(/is-immersive/);
  if (info.project.name === "desktop")
    expect(
      await page.evaluate(() =>
        document.fullscreenElement?.classList.contains("book-reader"),
      ),
    ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Exit fullscreen" }),
  ).toBeVisible();
  await page.getByLabel("Reading settings").click();
  await expect(prefs).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prefs).toHaveCount(0);
  await expect(page.locator(".book-reader")).toHaveClass(/is-immersive/);
  await page.screenshot({
    path: `test-results/${info.project.name}-reader-fullscreen.png`,
  });
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(page.locator(".book-reader")).not.toHaveClass(/is-immersive/);
  // Browsers without the Fullscreen API still provide a screen-filling reader.
  await page.evaluate(() =>
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.getByRole("status")).toContainText("window-filling view");
  await page.keyboard.press("Escape");
  await expect(page.locator(".book-reader")).not.toHaveClass(/is-immersive/);
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Text selectable").check();
  expect(
    await page
      .locator(".reading-text")
      .evaluate((el) => getComputedStyle(el).userSelect),
  ).not.toBe("none");
  await page.getByLabel("Text selectable").uncheck();
  const decrease = page.getByRole("button", { name: "Decrease text size" });
  const increase = page.getByRole("button", { name: "Increase text size" });
  const size = page.getByLabel("Current text size");
  await expect(
    page.getByRole("group", { name: "Text size", exact: true }),
  ).toBeVisible();
  await expect(size).toHaveText("14 pt");
  for (let n = 15; n <= 16; n++) {
    await increase.click();
    await expect(size).toHaveText(`${n} pt`);
  }
  await expect(increase).toBeDisabled();
  await expect(page.locator(".reading-text")).toHaveCSS(
    "font-size",
    "21.3333px",
  );
  for (let n = 15; n >= 8; n--) {
    await decrease.click();
    await expect(size).toHaveText(`${n} pt`);
  }
  await expect(decrease).toBeDisabled();
  await expect(increase).toBeEnabled();
  await expect(page.locator(".reading-text")).toHaveCSS(
    "font-size",
    "10.6667px",
  );
  await page.getByLabel("Animate page turns").uncheck();
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  expect(
    await page
      .locator(".reading-text")
      .evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe("none");
  await next.click();
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Show paragraph IDs")).toBeChecked();
  await expect(page.getByLabel("Text selectable")).not.toBeChecked();
  await expect(page.getByLabel("Animate page turns")).not.toBeChecked();
  await expect(page.getByLabel("Paper texture")).toHaveValue("grain");
  await expect(page.getByLabel("Current text size")).toHaveText("8 pt");
  await expect(decrease).toBeDisabled();
  await expect(page.locator(".reading-text")).toHaveCSS(
    "font-size",
    "10.6667px",
  );
  await expect(
    page.getByRole("radio", { name: "Sepia", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(prefs).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
