import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function stored(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const open = indexedDB.open("khosra-studio-v2");
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const read = db
      .transaction("workspace")
      .objectStore("workspace")
      .get("owner");
    const row = await new Promise<{ state: State }>((resolve) => {
      read.onsuccess = () => resolve(read.result);
    });
    db.close();
    return row.state;
  });
}
test("chapter deletion is confirmed, excluded from export, persistent and recoverable with original references", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("A recoverable manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page
    .getByLabel("Edit paragraph P1", { exact: true })
    .fill("প্রিয় গল্প। Words to keep safely.");
  // Opening actions must flush even the prose typed just before deletion.
  await page
    .getByRole("button", { name: "Chapter actions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete chapter", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Delete chapter?",
    exact: true,
  });
  await expect(
    confirm.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-delete-chapter.png`,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Chapter actions", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const before = await stored(page),
    original = before.chapters[0];
  await page
    .getByRole("button", { name: "Delete chapter", exact: true })
    .click();
  await confirm
    .getByRole("button", { name: "Delete chapter", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No chapters yet", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No chapters yet", exact: true }),
  ).toBeVisible();
  const deleted = await stored(page);
  expect(deleted.chapters[0].deletedAt).toBeTruthy();
  expect(deleted.revisions).toEqual(before.revisions);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  await page
    .getByLabel("Chapter title", { exact: true })
    .fill("Surviving chapter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page
    .getByLabel("Edit paragraph P1", { exact: true })
    .fill("This chapter stays in the manuscript.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Settings & backups", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export this book as text", exact: true })
    .click();
  const stream = await (await download).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  expect(text).toContain("Surviving chapter");
  expect(text).not.toContain("Words to keep safely");
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: /Deleted chapters/ }).click();
  const trash = page.getByRole("dialog", {
    name: "Deleted chapters",
    exact: true,
  });
  await trash.getByText("Preview chapter", { exact: true }).click();
  await expect(trash).toContainText("প্রিয় গল্প। Words to keep safely.");
  await page.screenshot({
    path: `test-results/${info.project.name}-chapter-trash.png`,
  });
  await trash
    .getByRole("button", { name: "Restore Untitled chapter", exact: true })
    .click();
  await expect(page.locator(".paragraph-content")).toContainText(
    "প্রিয় গল্প। Words to keep safely.",
  );
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const restored = await stored(page);
  expect(restored.chapters.find((c) => c.id === original.id)).toEqual(original);
  expect(restored.revisions.filter((r) => r.chapterId === original.id)).toEqual(
    before.revisions,
  );
  await page.reload();
  await expect(page.locator(".paragraph-content")).toContainText(
    "Words to keep safely",
  );
});
