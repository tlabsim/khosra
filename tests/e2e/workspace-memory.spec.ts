import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";

test("large library keeps history compact through editing and reload", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop memory profile");
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Synthetic large library");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const fixture = await page.evaluate(async () => {
    const open = indexedDB.open("khosra-studio-v2");
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace");
    const request = store.get("owner");
    let bytes = 0,
      head = "",
      first = "";
    request.onsuccess = () => {
      const row = request.result as {
          id: string;
          state: State;
          version: number;
        },
        s = row.state;
      const book = s.books[0],
        chapter = s.chapters[0],
        original = s.revisions[0];
      s.books = [];
      s.chapters = [];
      s.revisions = [];
      for (let b = 0; b < 8; b++) {
        const bid = b === 0 ? book.id : crypto.randomUUID(),
          cid = b === 0 ? chapter.id : crypto.randomUUID();
        s.books.push({ ...book, id: bid, title: `Synthetic book ${b + 1}` });
        const blocks = Array.from({ length: 400 }, (_, i) => ({
          id: crypto.randomUUID(),
          label: i + 1,
          section: "",
          text:
            `বাংলা সংলাপ ${i}। ` +
            "A synthetic passage for measurement. ".repeat(2),
        }));
        let parent: string | null = null;
        for (let r = 0; r < 100; r++) {
          const id = crypto.randomUUID();
          s.revisions.push({
            ...original,
            id,
            chapterId: cid,
            parentId: parent,
            message: `Author session ${r}`,
            paragraphs: blocks.map((p, i) => ({
              ...p,
              text: i === 0 ? `${r} ${p.text}` : p.text,
            })),
          });
          parent = id;
        }
        s.chapters.push({
          ...chapter,
          id: cid,
          bookId: bid,
          title: `Chapter ${b + 1}`,
          headId: parent!,
        });
        if (b === 0) {
          head = parent!;
          first = s.revisions[0].id;
        }
      }
      bytes = new Blob([JSON.stringify(s)]).size;
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { bytes, head, first };
  });
  const reloadStart = Date.now();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chapter 1", exact: true }).first(),
  ).toBeVisible({ timeout: 60000 });
  const loadMs = Date.now() - reloadStart;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = async () =>
    (await cdp.send("Performance.getMetrics")).metrics.find(
      (m) => m.name === "JSHeapUsedSize",
    )!.value / 1048576;
  const loadedHeapMiB = await heap();
  await page.locator(".paragraph-content > p").first().dblclick();
  const editor = page.getByRole("textbox", {
    name: "Edit paragraph P1",
    exact: true,
  });
  const start = Date.now();
  await editor.fill("A focused paragraph edit in the large library.");
  const inputMs = Date.now() - start;
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device", {
    timeout: 60000,
  });
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open("khosra-studio-v2"),
      db = await new Promise<IDBDatabase>((resolve) => {
        req.onsuccess = () => resolve(req.result);
      });
    const read = db
      .transaction("workspace")
      .objectStore("workspace")
      .get("owner");
    const s = await new Promise<State>((resolve) => {
      read.onsuccess = () => resolve(read.result.state);
    });
    db.close();
    return {
      books: s.books.length,
      revisions: s.revisions.length,
      first: s.revisions[0].id,
      uniqueBlocks: new Set(s.revisions.flatMap((r) => r.paragraphs)).size,
      text: s.revisions.find((r) => r.id === s.chapters[0].headId)!
        .paragraphs[0].text,
      oldHead: !!s.revisions.find((r) => r.id === s.chapters[0].headId)
        ?.parentId,
    };
  });
  expect(saved.books).toBe(8);
  expect(saved.revisions).toBeGreaterThan(800);
  expect(saved.first).toBe(fixture.first);
  expect(saved.uniqueBlocks).toBeLessThan(6000);
  expect(saved.text).toBe("A focused paragraph edit in the large library.");
  expect(saved.oldHead).toBe(true);
  await cdp.send("HeapProfiler.collectGarbage");
  const editedHeapMiB = await heap();
  await page.reload();
  await expect(
    page.getByText("A focused paragraph edit in the large library.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  const profile = JSON.stringify(
    {
      archiveMiB: fixture.bytes / 1048576,
      loadMs,
      inputMs,
      loadedHeapMiB,
      editedHeapMiB,
      ...saved,
    },
    null,
    2,
  );
  const path = info.outputPath("memory-profile.json");
  await writeFile(path, profile);
  await info.attach("large-library-profile", {
    path,
    contentType: "application/json",
  });
});
