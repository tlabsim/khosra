import { test, expect } from "@playwright/test";

test("A5 page turns keep document and fullscreen scroll extents stable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      "khosra-reader",
      JSON.stringify({ size: 12, flip: true }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Turning pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  await page
    .getByLabel("Chapter text", { exact: true })
    .fill(
      Array.from(
        { length: 70 },
        (_, index) =>
          `[${index + 1}] নদীর ওপারে আলো জ্বলছিল। রাহুল জানালার পাশে এসে দাঁড়াল। A turn keeps every paragraph in place.`,
      ).join("\n\n"),
    );
  await page.getByRole("button", { name: "Save as a new revision" }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.getByLabel("Page format")).toHaveValue("a5");
  await page.getByRole("button", { name: "Close reading preferences" }).click();

  for (const immersive of [false, true]) {
    if (immersive) {
      await page.getByRole("button", { name: "Enter fullscreen" }).click();
      await expect(page.locator(".book-reader")).toHaveClass(/is-immersive/);
    }
    for (const mode of ["pages", "spread"]) {
      await page.getByLabel("Reading layout").selectOption(mode);
      await expect(
        page.getByRole("button", { name: "Next page", exact: true }),
      ).toBeEnabled();
      // Wait for responsive/fullscreen measurement before recording the baseline.
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      for (const direction of ["Next", "Previous"]) {
        const result = await page.evaluate(async (direction) => {
          const reader = document.querySelector<HTMLElement>(".book-reader")!;
          const root = document.documentElement;
          const measure = () => [
            root.scrollWidth,
            root.scrollHeight,
            root.clientWidth,
            root.clientHeight,
            reader.scrollWidth,
            reader.scrollHeight,
            reader.clientWidth,
            reader.clientHeight,
          ];
          const before = measure();
          document
            .querySelector<HTMLButtonElement>(
              `button[aria-label="${direction} page"]`,
            )!
            .click();
          await new Promise(requestAnimationFrame);
          const scene = document.querySelector(".page-turn-scene");
          if (!scene) throw new Error("Expected an animated page turn");
          const animations = scene.getAnimations({ subtree: true });
          animations.forEach((animation) => animation.pause());
          const frames = [];
          for (const time of [0, 160, 340, 600, 810]) {
            animations.forEach((animation) => {
              animation.currentTime = time;
            });
            await new Promise(requestAnimationFrame);
            frames.push(measure());
          }
          animations.forEach((animation) => animation.play());
          return { before, frames, count: animations.length };
        }, direction);
        expect(
          result.count,
          `${immersive} ${mode} ${direction}: animation count`,
        ).toBeGreaterThan(0);
        for (const frame of result.frames) {
          frame.forEach((value, index) =>
            expect(
              Math.abs(value - result.before[index]),
              `${immersive} ${mode} ${direction} dimension ${index}: ${JSON.stringify(result)}`,
            ).toBeLessThanOrEqual(1),
          );
        }
        await expect(page.locator(".page-turn-scene")).toHaveCount(0);
      }
    }
  }
});
