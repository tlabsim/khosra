import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function stored(page: import("@playwright/test").Page): Promise<State> {
  return page.evaluate(async () => {
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
    return (await db.workspace.get("owner")).state;
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Cleanup test");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const row = await db.workspace.get("owner"),
      s = row.state as State;
    const c = s.chapters[0],
      r = s.revisions.find((r) => r.id === c.headId)!;
    r.paragraphs[0].text = "নদীর ধারে রহস্য। ".repeat(2000);
    s.proposals = ["rejected", "accepted", "pending"].map((status) => ({
      id: crypto.randomUUID(),
      chapterId: c.id,
      baseRevisionId: r.id,
      title: `Proposal ${status}`,
      rationale: "Test",
      paragraphs: r.paragraphs,
      status: status as "pending",
      createdAt: new Date().toISOString(),
    }));
    s.contexts = [1, 2].map((n) => ({
      id: crypto.randomUUID(),
      chapterId: c.id,
      revisionId: r.id,
      summary: `Context ${n}`,
      facts: [],
      createdAt: new Date().toISOString(),
    }));
    await db.workspace.put({
      ...row,
      state: s,
      version: (row.version || 0) + 1,
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^History/ })
    .filter({ visible: true })
    .first()
    .click();
});
test("previews cleanup, downloads full backup, confirms and persists across reload", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "desktop" ? 1280 : 393,
    height: 600,
  });
  const before = await stored(page);
  await expect(
    page.getByRole("heading", { name: "Chapter cleanup", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Remove reviewed proposal copies and older context/),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("compact-cleanup-header.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clean up chapter", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Clean up chapter" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Download backup first" }),
  ).toBeInViewport();
  expect(
    await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
  const footerBottom = await dialog
    .locator("footer")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footerBottom).toBeLessThanOrEqual(592);
  await expect(
    dialog.getByText(
      "Manuscript text, revision history and pending work stay.",
    ),
  ).toBeVisible();
  await dialog.locator("summary").click();
  await expect(
    dialog.getByRole("button", { name: "Download backup first" }),
  ).toBeInViewport();
  await dialog.locator("summary").click();
  await expect(dialog.getByText(/Remove 2 reviewed proposals/)).toBeVisible();

  await expect(
    dialog.getByRole("button", { name: "Confirm cleanup" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("cleanup-preview.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await stored(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Clean up chapter", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download backup first" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^khosra-before-cleanup-/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const envelope = JSON.parse(Buffer.concat(chunks).toString());
  expect(JSON.parse(envelope.payload)).toEqual(before);
  await expect(
    dialog.getByRole("button", { name: "Confirm cleanup" }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Confirm cleanup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const after = await stored(page);
  expect(after.proposals).toEqual(
    before.proposals.filter((p) => p.status === "pending"),
  );
  expect(after.contexts).toEqual(before.contexts.slice(-1));
  expect(after.revisions).toEqual(before.revisions);
  expect(after.chapters).toEqual(before.chapters);
  expect(after.chapterCleanups).toHaveLength(1);
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).not.toBe("hidden");
  await page.reload();
  expect(await stored(page)).toEqual(after);
  await page
    .getByRole("button", { name: /^History/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Clean up chapter", exact: true })
    .click();
  await expect(
    dialog.getByText("Nothing to clean up in this chapter yet."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Download backup first" }),
  ).toBeDisabled();
});
