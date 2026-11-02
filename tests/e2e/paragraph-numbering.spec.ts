import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";

async function savedState(page: import("@playwright/test").Page) {
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("khosra-studio-v2");
      req.onsuccess = () => resolve(req.result);
    });
    const req = db
      .transaction("workspace")
      .objectStore("workspace")
      .get("owner");
    const row = await new Promise<{ state: State }>((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return row.state;
  });
}

test("legacy paragraph numbers become ordered, preserve source and pending proposals, and stay ordered after acceptance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Ordered paragraphs");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await savedState(page);
  const original = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("khosra-studio-v2");
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction("workspace", "readwrite");
    const store = tx.objectStore("workspace"),
      req = store.get("owner");
    const original = await new Promise<{
      sourceId: string;
      paragraphIds: string[];
    }>((resolve) => {
      req.onsuccess = () => {
        const row = req.result as { state: State; version: number },
          s = row.state;
        const c = s.chapters[0],
          r = s.revisions.find((r) => r.id === c.headId)!;
        r.paragraphs = [1, 50, 2].map((label, i) => ({
          id: crypto.randomUUID(),
          label,
          section: "",
          text: `Original text ${i + 1}`,
        }));
        c.approvedId = r.id;
        s.proposals = [
          {
            id: crypto.randomUUID(),
            chapterId: c.id,
            baseRevisionId: r.id,
            title: "Shorten opening",
            rationale: "Delete middle paragraph",
            createdAt: new Date().toISOString(),
            status: "pending",
            paragraphs: [
              r.paragraphs[0],
              { ...r.paragraphs[2], text: "Proposed ending" },
            ],
          },
        ];
        store.put({ ...row, version: row.version + 1 });
        resolve({
          sourceId: r.id,
          paragraphIds: r.paragraphs.map((p) => p.id),
        });
      };
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return original;
  });
  await page.reload();
  await expect(page.locator(".paragraph-id")).toHaveText(["P1", "P2", "P3"]);
  const ordered = await savedState(page);
  const current = ordered.revisions.find(
    (r) => r.id === ordered.chapters[0].headId,
  )!;
  expect(current.paragraphs.map((p) => p.id)).toEqual(original.paragraphIds);
  expect(ordered.chapters[0].approvedId).toBe(original.sourceId);
  expect(
    ordered.revisions
      .find((r) => r.id === original.sourceId)!
      .paragraphs.map((p) => p.label),
  ).toEqual([1, 50, 2]);
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Accept all/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Confirm acceptance" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const accepted = await savedState(page);
  const after = accepted.revisions.find(
    (r) => r.id === accepted.chapters[0].headId,
  )!;
  expect(after.paragraphs.map((p) => p.label)).toEqual([1, 2]);
  expect(after.paragraphs.map((p) => p.text)).toEqual([
    "Original text 1",
    "Proposed ending",
  ]);
  expect(accepted.proposals[0].status).toBe("accepted");
  await page.reload();
  const reopened = await savedState(page);
  expect(reopened.revisions).toEqual(accepted.revisions);
  await expect(
    page.getByText("Workspace unavailable", { exact: true }),
  ).toHaveCount(0);
});
