import { test, expect } from "@playwright/test";
function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const [r, g, b] = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((s) => {
        const n = Number(s) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test("contrast boost darkens foregrounds while preserving surfaces, paper previews and pagination", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("khosra-reader"))
      localStorage.setItem(
        "khosra-reader",
        JSON.stringify({
          paper: "sepia",
          texture: "grain",
          size: 14,
          mode: "pages",
          progress: true,
        }),
      );
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "normal");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Clearer pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  await page
    .getByLabel("Chapter text", { exact: true })
    .fill(
      Array.from(
        { length: 20 },
        (_, i) =>
          `[${i + 1}] নদীর ওপারে আলো জ্বলছিল। Words with a clearer outline.`,
      ).join("\n\n"),
    );
  await page.getByRole("button", { name: "Save as a new revision" }).click();
  const paperBackground = await page
    .locator(".paper")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole("button", { name: "Settings & backups" }).click();
  const sectionOrder = await page
    .locator(".settings-grid > section h2")
    .allTextContents();
  expect(sectionOrder).toEqual([
    "Private server",
    "ChatGPT",
    "Appearance",
    "Backups & recovery",
  ]);
  const normalColors = await page
    .locator(".settings-appearance")
    .evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      border: getComputedStyle(el).borderTopColor,
    }));
  const headerBackground = await page
    .locator(".desk-header")
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  const toggle = page.getByRole("switch", {
    name: "High contrast",
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  expect(
    await page.evaluate(() => localStorage.getItem("khosra-appearance-v1")),
  ).toBe("high");
  const colors = await page.locator(".settings-appearance").evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    text: getComputedStyle(el.querySelector("strong")!).color,
    border: getComputedStyle(el).borderTopColor,
  }));
  expect(contrast(colors.text, colors.bg)).toBeGreaterThanOrEqual(7);
  expect(colors.bg).toBe(normalColors.bg);
  expect(contrast(colors.border, colors.bg)).toBeGreaterThan(
    contrast(normalColors.border, normalColors.bg),
  );
  await expect(page.locator(".desk-header")).toHaveCSS(
    "background-color",
    headerBackground,
  );
  const primary = await page
    .getByRole("button", { name: "Connect", exact: true })
    .evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color,
    }));
  expect(contrast(primary.text, primary.bg)).toBeGreaterThanOrEqual(7);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".desk-header")).not.toHaveClass(/is-scrolled/);
  await page.screenshot({
    path: `test-results/${info.project.name}-high-contrast-settings.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await expect(page.locator(".paper")).toHaveCSS(
    "background-color",
    paperBackground,
  );
  await page
    .getByRole("button", { name: "Chapter actions", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/${info.project.name}-high-contrast-actions.png`,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".reading-sheet")).toHaveCSS(
    "background-color",
    "rgb(244, 234, 215)",
  );
  await expect(page.locator(".reading-sheet")).not.toHaveCSS(
    "background-image",
    "none",
  );
  await page.getByLabel("Reading settings").click();
  await expect(
    page.getByRole("radio", { name: "Sepia", exact: true }),
  ).toBeChecked();
  for (const [paper, color] of [
    ["ivory", "rgb(255, 254, 249)"],
    ["white", "rgb(255, 255, 255)"],
    ["sepia", "rgb(244, 234, 215)"],
  ]) {
    await expect(page.locator(`.reader-color-${paper} i`)).toHaveCSS(
      "background-color",
      color,
    );
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-contrast-paper-previews.png`,
  });
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await expect(page.locator(".reading-text p").first()).toHaveCSS(
    "color",
    "rgb(38, 54, 42)",
  );
  const pages = await page
    .getByLabel("Go to page", { exact: true })
    .locator("option")
    .count();
  await page.screenshot({
    path: `test-results/${info.project.name}-high-contrast-reader.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await expect(toggle).toBeChecked();
  const peer = await page.context().newPage();
  await peer.goto("/");
  await expect(peer.locator("html")).toHaveAttribute("data-contrast", "high");
  await toggle.uncheck();
  await expect(peer.locator("html")).toHaveAttribute("data-contrast", "normal");
  await peer.close();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "normal");
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".book-reader")).toHaveClass(
    /paper-sepia texture-grain/,
  );
  await expect(page.locator(".reading-sheet")).toHaveCSS(
    "background-color",
    "rgb(244, 234, 215)",
  );
  await expect(page.locator(".reading-sheet")).not.toHaveCSS(
    "background-image",
    "none",
  );
  expect(
    await page
      .getByLabel("Go to page", { exact: true })
      .locator("option")
      .count(),
  ).toBe(pages);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "normal");
});
