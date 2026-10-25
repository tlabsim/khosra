import { test, expect } from "@playwright/test";

test("mouse page dragging preserves optional text selection and survives reload", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Mouse gesture coverage uses desktop Chromium.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Pages by the river");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  const prose = "নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে দাঁড়াল। ".repeat(
    200,
  );
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page.getByRole("textbox", { name: "Edit paragraph P1" }).fill(prose);
  await page.locator(".paper-heading").click();
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByRole("region", { name: "Manuscript pages" });
  const picker = page.getByLabel("Go to page");
  const drag = async (dx: number, dy = 0, outside = false, cancel = false) => {
    const box = (await frame.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(outside ? box.x - 40 : x + dx, y + dy, { steps: 8 });
    if (cancel)
      await frame.dispatchEvent("pointercancel", {
        pointerType: "mouse",
        pointerId: 1,
      });
    await page.mouse.up();
  };
  await drag(-150);
  await expect(picker).toHaveValue("0");
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Drag to turn pages")).not.toBeChecked();
  await page.getByLabel("Drag to turn pages").check();
  await page.getByLabel("Animate page turns").uncheck();
  await expect(
    page.getByText("Hold Shift to select text with the mouse."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-reader-drag-preferences.png",
  });
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(frame).toHaveCSS("cursor", "grab");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await drag(140); // Already at the start.
  await expect(picker).toHaveValue("0");
  await drag(-20); // Too short.
  await expect(picker).toHaveValue("0");
  await drag(-80, 120); // Predominantly vertical.
  await expect(picker).toHaveValue("0");
  await drag(-150, 0, false, true); // Cancelled gesture.
  await expect(picker).toHaveValue("0");
  await expect(frame).not.toHaveClass(/is-dragging/);
  await drag(-150);
  await expect(picker).toHaveValue("1");
  expect(
    await page.evaluate(() => window.getSelection()?.toString() || ""),
  ).toBe("");
  await drag(150);
  await expect(picker).toHaveValue("0");
  await drag(-150, 0, true); // Pointer capture retains a release outside the text.
  await expect(picker).toHaveValue("1");
  await picker.selectOption("0");
  const line = await page.locator(".reading-text p").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getClientRects()[0];
    return { x: r.left + 3, y: r.top + r.height / 2 };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(line.x, line.y);
  await page.mouse.down();
  await page.mouse.move(line.x + 140, line.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(picker).toHaveValue("0");
  expect(
    await page.evaluate(() => window.getSelection()?.toString().length || 0),
  ).toBeGreaterThan(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Animate page turns").check();
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await drag(-150);
  await expect(page.locator(".page-turn-scene")).toBeVisible();
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Animate page turns").uncheck();
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await picker.selectOption("0");
  await page.getByLabel("Reading layout").selectOption("spread");
  await expect(page.locator(".reading-sheet")).toHaveClass(/is-spread/);
  await drag(-150);
  await expect(picker).toHaveValue("2");
  await page.getByLabel("Reading layout").selectOption("continuous");
  await expect(frame).not.toHaveClass(/mouse-page-drag/);
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Drag to turn pages")).toHaveCount(0);
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByLabel("Reading layout").selectOption("pages");
  await page.getByLabel("Reading settings").click();
  await expect(page.getByLabel("Drag to turn pages")).toBeChecked();
  await page.getByLabel("Drag to turn pages").uncheck();
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(frame).not.toHaveClass(/mouse-page-drag/);
  await drag(-150);
  await expect(picker).toHaveValue("0");
  await expect(page.locator(".reading-text p")).toHaveText(prose.trim());
});
