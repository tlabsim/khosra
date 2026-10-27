import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __pageFades: { target: Element; animation: Animation }[];
    __activeEditor: Element | null;
  }
}
async function openWorkspace(
  page: Page,
  reducedMotion: "reduce" | "no-preference",
) {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(() => {
    window.__pageFades = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (
        typeof options === "object" &&
        options?.id === "khosra-page-transition"
      )
        window.__pageFades.push({ target: this, animation });
      return animation;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Transition manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
}
const count = (page: Page) => page.evaluate(() => window.__pageFades.length);
const navigate = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Chapter workspace" })
    .getByRole("button", { name, exact: true })
    .click();

test("view fades preserve editing, keep navigation steady, and exclude reader page turns", async ({
  page,
}) => {
  await openWorkspace(page, "no-preference");
  const starting = await count(page);
  await navigate(page, "Flags");
  await expect(
    page.getByRole("heading", { name: "Flags", exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBeGreaterThan(starting);
  const fade = await page.evaluate(() => {
    const { animation, target } = window.__pageFades.at(-1)!;
    const effect = animation.effect as KeyframeEffect;
    return {
      duration: effect.getTiming().duration,
      frames: effect
        .getKeyframes()
        .map((f) => ({ opacity: f.opacity, transform: f.transform })),
      tag: target.tagName,
      chrome: !!target.closest(".topbar, .workspace-nav"),
    };
  });
  expect(fade.duration).toBe(150);
  expect(fade.frames.map((f) => f.opacity)).toEqual(["0.65", "1"]);
  expect(fade.frames.every((f) => !f.transform || f.transform === "none")).toBe(
    true,
  );
  expect(fade.tag).toBe("MAIN");
  expect(fade.chrome).toBe(false);
  // Rapid navigation replaces the old fade rather than waiting for it.
  await navigate(page, "Proposals");
  await navigate(page, "History");
  await expect(
    page.getByRole("heading", { name: "Revision history", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__pageFades
        .slice(0, -1)
        .every((f) => f.animation.playState === "idle"),
    ),
  ).toBe(true);
  await navigate(page, "Manuscript");
  await page
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Edit paragraph P1",
    exact: true,
  });
  await editor.focus();
  await page.evaluate(() => (window.__activeEditor = document.activeElement));
  const beforeTyping = await count(page);
  await editor.fill("পথ ধরে এগিয়ে গেল গল্প।");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("পথ ধরে এগিয়ে গেল গল্প।");
  expect(
    await page.evaluate(() => window.__activeEditor === document.activeElement),
  ).toBe(true);
  expect(await count(page)).toBe(beforeTyping);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect(await count(page)).toBe(beforeTyping);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reader-page")).toBeVisible();
  expect(await count(page)).toBe(beforeTyping);
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await expect(page.locator(".paper")).toContainText("পথ ধরে এগিয়ে গেল গল্প।");
  await page
    .getByRole("button", { name: "Settings & backups", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings & connections", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__pageFades.at(-1)!.target.classList.contains("settings-page"),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await page.getByRole("link", { name: "Khosra library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Manuscripts", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__pageFades.at(-1)!.target.classList.contains("library"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reduced motion skips fades and cancels existing ones without delaying navigation", async ({
  page,
}) => {
  await openWorkspace(page, "reduce");
  await navigate(page, "Flags");
  await navigate(page, "Proposals");
  await expect(
    page.getByRole("heading", { name: "Proposals", exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await navigate(page, "History");
  expect(await count(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__pageFades.every((f) => f.animation.playState === "idle"),
      ),
    )
    .toBe(true);
  const before = await count(page);
  await navigate(page, "Context");
  await expect(
    page.getByRole("heading", { name: "Chapter context", exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBe(before);
});
