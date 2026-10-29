import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function seed(
  page: import("@playwright/test").Page,
  count: number,
  selected = 0,
) {
  await page.evaluate(
    async ({ count, selected }) => {
      const path = "/src/storage/db.ts";
      const { db } = await import(/* @vite-ignore */ path);
      const row = await db.workspace.get("owner"),
        s = row.state as State;
      const c = s.chapters[0],
        r = s.revisions[0];
      s.chapters = [];
      s.revisions = [];
      for (let i = 0; i < count; i++) {
        const id = crypto.randomUUID(),
          revisionId = crypto.randomUUID();
        s.chapters.push({
          ...c,
          id,
          headId: revisionId,
          code: i + 1,
          position: i,
          title: `অধ্যায় ${i + 1} · ${i % 3 === 0 ? "একটি দীর্ঘ অধ্যায়ের নাম এবং রহস্যের নতুন সূত্র" : "নতুন সূত্র"}`,
        });
        s.revisions.push({
          ...r,
          id: revisionId,
          chapterId: id,
          parentId: null,
          paragraphs: r.paragraphs.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
          })),
        });
      }
      if (selected) {
        // App selects the first stored chapter on load; display order still follows position.
        s.chapters.unshift(...s.chapters.splice(selected, 1));
      }
      await db.workspace.put({
        ...row,
        state: s,
        version: (row.version || 0) + 1,
      });
    },
    { count, selected },
  );
  await page.reload();
}
async function open(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  return page.getByRole("complementary", { name: "Chapter contents" });
}
const geometry = (page: import("@playwright/test").Page) =>
  page.locator(".chapter-list").evaluate((list) => {
    const buttons = Array.from(list.querySelectorAll("button"));
    const rects = buttons.map((b) => b.getBoundingClientRect());
    return {
      columns: new Set(rects.map((r) => Math.round(r.x))).size,
      overflowX: list.scrollWidth - list.clientWidth,
      overflowY: list.scrollHeight - list.clientHeight,
      top: list.scrollTop,
      viewport: list.getBoundingClientRect().toJSON(),
      rects: rects.map((r) => r.toJSON()),
    };
  });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Chapter navigation");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
});
test("contents adapts columns to chapter count and available desktop space", async ({
  page,
}, info) => {
  if (info.project.name === "android") {
    await seed(page, 30);
    const drawer = await open(page);
    expect((await geometry(page)).columns).toBe(1);
    expect((await geometry(page)).overflowX).toBeLessThanOrEqual(1);
    await drawer.locator(".chapter-list > button").last().click();
    await expect(drawer).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /অধ্যায় 30/ }).first(),
    ).toBeVisible();
    return;
  }
  await page.setViewportSize({ width: 1920, height: 1000 });
  await seed(page, 3);
  let drawer = await open(page);
  await expect.poll(async () => (await geometry(page)).columns).toBe(1);
  await drawer.getByRole("button", { name: "Close contents" }).click();
  await seed(page, 20);
  drawer = await open(page);
  await expect
    .poll(async () => (await geometry(page)).columns)
    .toBeGreaterThan(1);
  const g = await geometry(page);
  expect(g.columns).toBeLessThanOrEqual(4);
  expect(g.overflowY).toBeLessThanOrEqual(1);
  expect(g.overflowX).toBeLessThanOrEqual(1);
  const columnStart = g.rects.findIndex((r) => r.x > g.rects[0].x + 10);
  expect(columnStart).toBeGreaterThan(1);
  expect(g.rects[columnStart].y).toBeCloseTo(g.rects[0].y, 0);
  expect(g.rects[1].y).toBeGreaterThan(g.rects[0].y);
  await page.screenshot({
    path: info.outputPath("contents-columns.png"),
    fullPage: true,
  });
  for (const [width, height] of [
    [1000, 700],
    [800, 500],
    [1920, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => (await drawer.boundingBox())!.width)
      .toBeLessThan(width);
    expect((await geometry(page)).overflowX).toBeLessThanOrEqual(1);
  }
  const items = drawer.locator(".chapter-list > button");
  await items.nth(0).focus();
  await page.keyboard.press("Tab");
  await expect(items.nth(1)).toBeFocused();
  await items.last().click();
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /অধ্যায় 20/ }).first(),
  ).toBeVisible();
  drawer = await open(page);
  await expect(drawer.locator('[aria-current="page"]')).toContainText(
    "অধ্যায় 20",
  );
  await drawer.getByRole("button", { name: "Close contents" }).focus();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
test("large contents scrolls within bounded columns and opens at the selected chapter", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1600, height: 720 });
  await seed(page, 160, 159);
  const drawer = await open(page);
  const selected = drawer.locator('[aria-current="page"]');
  await expect(selected).toContainText("অধ্যায় 160");
  await expect.poll(async () => (await geometry(page)).top).toBeGreaterThan(0);
  const g = await geometry(page),
    r = await selected.boundingBox();
  expect(g.columns).toBeLessThanOrEqual(
    info.project.name === "desktop" ? 4 : 1,
  );
  expect(r!.y).toBeGreaterThanOrEqual(g.viewport.y - 1);
  expect(r!.y + r!.height).toBeLessThanOrEqual(g.viewport.bottom + 1);
  expect(g.overflowX).toBeLessThanOrEqual(1);
  await expect(
    drawer.getByRole("button", { name: "Add chapter", exact: true }),
  ).toBeInViewport();
});
