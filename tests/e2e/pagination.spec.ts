import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Chapter workspace" })
    .getByRole("button", { name, exact: true })
    .click();
}
function pager(page: Page, label: string) {
  return page.getByRole("navigation", {
    name: `${label} pages (top)`,
    exact: true,
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Large workspace");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      request = store.get("owner");
    request.onsuccess = () => {
      const row = request.result as { state: State; version: number };
      const s = row.state,
        book = s.books[0],
        chapter = s.chapters[0],
        original = s.revisions[0];
      original.paragraphs = Array.from({ length: 102 }, (_, i) => ({
        id: crypto.randomUUID(),
        label: i + 1,
        section: "",
        text: `Passage ${i + 1}`,
      }));
      let parent = original;
      for (let i = 0; i < 204; i++) {
        const next = {
          ...original,
          id: crypto.randomUUID(),
          parentId: parent.id,
          paragraphs: original.paragraphs.slice(0, 1),
          message:
            i === 0
              ? "Deleted passages"
              : i < 102
                ? `Earlier revision ${i}`
                : "Author session pagination-fixture",
          createdAt: new Date(Date.now() + i * 1000).toISOString(),
        };
        s.revisions.push(next);
        parent = next;
      }
      chapter.headId = parent.id;
      s.flags = Array.from({ length: 101 }, (_, i) => ({
        id: crypto.randomUUID(),
        number: i + 1,
        chapterId: chapter.id,
        revisionId: parent.id,
        paragraphIds: [original.paragraphs[0].id],
        quote: "",
        note: `Flag note ${i + 1}`,
        kind: "discussion",
        status: "open",
        createdAt: new Date().toISOString(),
      }));
      s.contexts = [
        {
          id: crypto.randomUUID(),
          chapterId: chapter.id,
          revisionId: parent.id,
          summary: "Indexed chapter",
          facts: Array.from({ length: 101 }, (_, i) => ({
            kind: "event",
            text: `Context fact ${i + 1}`,
            paragraphIds: [original.paragraphs[0].id],
          })),
          createdAt: new Date().toISOString(),
        },
      ];
      for (let i = 1; i <= 100; i++) {
        const b = {
          ...book,
          id: crypto.randomUUID(),
          title: `Manuscript ${i + 1}`,
        };
        const c = {
          ...chapter,
          id: crypto.randomUUID(),
          bookId: b.id,
          title: `Chapter for manuscript ${i + 1}`,
          headId: crypto.randomUUID(),
        };
        s.books.push(b);
        s.chapters.push(c);
        s.revisions.push({
          ...original,
          id: c.headId,
          chapterId: c.id,
          paragraphs: [{ ...original.paragraphs[0], id: crypto.randomUUID() }],
        });
      }
      for (let i = 1; i <= 101; i++) {
        const c = {
          ...chapter,
          id: crypto.randomUUID(),
          code: i + 1,
          position: i,
          title: `Deleted chapter ${i}`,
          headId: crypto.randomUUID(),
          deletedAt: new Date(Date.now() + i * 1000).toISOString(),
        };
        s.chapters.push(c);
        s.revisions.push({
          ...original,
          id: c.headId,
          chapterId: c.id,
          paragraphs: [{ ...original.paragraphs[0], id: crypto.randomUUID() }],
        });
      }
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
});

test("flags and context facts have 100-item pages and preserve actions and references", async ({
  page,
}) => {
  await section(page, "Flags");
  await expect(page.locator("main.page section.card")).toHaveCount(100);
  await pager(page, "Flag").getByRole("button", { name: "Next" }).click();
  await expect(page.locator("main.page section.card")).toHaveCount(1);
  await expect(page.getByText("Flag note 101", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Mark resolved", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  await section(page, "Context");
  await pager(page, "Context fact")
    .getByRole("button", { name: "Next" })
    .click();
  await expect(
    page.getByText("Context fact 101", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main.page section.card")).toHaveCount(2);
  await section(page, "Flags");
  await expect(pager(page, "Flag")).toContainText("Page 1 of 2");
  await expect(page.getByText("Flag note 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Flag note 101", { exact: true })).toHaveCount(0);
});

test("history pages grouped sessions, lazy recovery snapshots and deleted passages with restoration", async ({
  page,
}) => {
  await section(page, "History");
  await expect(page.locator(".history-row")).toHaveCount(100);
  await expect(page.locator(".history-passage")).toHaveCount(0);
  await page.locator(".recovery-snapshots > summary").click();
  await expect(page.locator(".recovery-snapshots .history-row")).toHaveCount(
    100,
  );
  await pager(page, "Recovery snapshot")
    .getByRole("button", { name: "Next" })
    .click();
  await expect(page.locator(".recovery-snapshots .history-row")).toHaveCount(1);
  await pager(page, "History").getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".history-row")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Deleted & cleared", exact: true })
    .click();
  await expect(page.locator(".history-passage")).toHaveCount(100);
  await expect(pager(page, "History")).toHaveCount(0);
  await pager(page, "Deleted passage")
    .getByRole("button", { name: "Next" })
    .click();
  await expect(page.locator(".history-passage")).toHaveCount(1);
  await expect(page.locator(".history-passage")).toContainText("Passage 102");
  await page
    .getByRole("button", { name: "Restore paragraph", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Already in manuscript", exact: true }),
  ).toBeDisabled();
  await section(page, "Manuscript");
  await expect(
    page.locator(".paper").getByText("Passage 102", { exact: true }),
  ).toBeVisible();
});

test("library pagination preserves book selection and the new-manuscript action", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Khosra library", exact: true }).click();
  await expect(page.locator(".library-book")).toHaveCount(100);
  await expect(
    page.getByRole("button", { name: "New manuscript", exact: true }),
  ).toBeVisible();
  await pager(page, "Manuscript").getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".library-book")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open Manuscript 101", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Chapter for manuscript 101",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
});

test("deleted-chapter pagination lazily previews and restores a chapter on the last page", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: /^Deleted chapters/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Deleted chapters",
    exact: true,
  });
  await expect(dialog.locator(".chapter-trash-item")).toHaveCount(100);
  await expect(dialog.locator(".chapter-trash-preview")).toHaveCount(0);
  await pager(page, "Deleted chapter")
    .getByRole("button", { name: "Next" })
    .click();
  await expect(dialog.locator(".chapter-trash-item")).toHaveCount(1);
  await dialog.getByText("Preview chapter", { exact: true }).click();
  await expect(dialog.locator(".chapter-trash-preview")).toContainText(
    "Passage 1",
  );
  await dialog
    .getByRole("button", { name: "Restore Deleted chapter 1", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Deleted chapter 1",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
});

test("invitations and feedback page independently and retain revoke/comment targets", async ({
  page,
}) => {
  const info = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const s = await new Promise<State>((resolve) => {
      const r = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("owner");
      r.onsuccess = () => resolve(r.result.state);
    });
    db.close();
    return {
      book: s.books[0].id,
      chapter: s.chapters[0].id,
      revision: s.chapters[0].headId,
    };
  });
  const invitations = Array.from({ length: 101 }, (_, i) => ({
    id: crypto.randomUUID(),
    recipient: `Reader ${i + 1}`,
    bookId: info.book,
    title: "Large workspace",
    chapterCount: 1,
    createdAt: 1,
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    revokedAt: null as number | null,
  }));
  const comments = Array.from({ length: 101 }, (_, i) => ({
    id: crypto.randomUUID(),
    chapter_id: info.chapter,
    revision_id: info.revision,
    paragraph_id: null,
    paragraph_label: null,
    chapter_title: "Review",
    quote: "",
    comment_text: `Reader comment ${i + 1}`,
    created_at: 1,
  }));
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === "/api/session")
      await route.fulfill({ json: { csrf: "test-csrf" } });
    else if (path === "/api/shares")
      await route.fulfill({ json: { invitations } });
    else if (path.endsWith("/comments"))
      await route.fulfill({ json: { comments } });
    else if (path.endsWith("/revoke")) {
      const id = path.split("/")[3];
      invitations.find((i) => i.id === id)!.revokedAt = Math.floor(
        Date.now() / 1000,
      );
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: {} });
  });
  await page
    .getByRole("button", { name: "Chapter actions", exact: true })
    .click();
  await page.getByRole("button", { name: /^Share for reading/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Share for reading",
    exact: true,
  });
  await expect(
    dialog.locator(".sharing-invitation-list > article"),
  ).toHaveCount(100);
  await pager(page, "Invitation").getByRole("button", { name: "Next" }).click();
  await expect(
    dialog.locator(".sharing-invitation-list > article"),
  ).toHaveCount(1);
  await expect(dialog.getByText("Reader 101", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Feedback", exact: true }).click();
  await expect(dialog.locator(".reader-comments article")).toHaveCount(100);
  await pager(page, "Feedback").getByRole("button", { name: "Next" }).click();
  await expect(dialog.locator(".reader-comments article")).toHaveCount(1);
  await expect(
    dialog.getByText("Reader comment 101", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Confirm revoke", exact: true })
    .click();
  await expect(
    dialog.getByText("1 chapter · Revoked", { exact: true }),
  ).toBeVisible();
  expect(requests).toContain(`/api/shares/${invitations[100].id}/revoke`);
  await pager(page, "Invitation")
    .getByRole("button", { name: "Previous" })
    .click();
  await expect(dialog.locator(".reader-comments article")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Feedback", exact: true })
    .first()
    .click();
  await expect(pager(page, "Feedback")).toContainText("Page 1 of 2");
});

test("sync conflict pages retain choices and prevent merging while another page is unresolved", async ({
  page,
}) => {
  test.setTimeout(120000);
  const local = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const s = await new Promise<State>((resolve) => {
      const r = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("owner");
      r.onsuccess = () => resolve(r.result.state);
    });
    db.close();
    return s;
  });
  const remote = structuredClone(local);
  remote.books = remote.books.map((b) => ({
    ...b,
    premise: "Competing server premise",
  }));
  await page.route("**/api/login", (route) =>
    route.fulfill({ json: { csrf: "fixture" } }),
  );
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { state: remote, version: 1 } })
      : route.fulfill({ status: 409, json: { error: "Changed" } }),
  );
  await page
    .getByRole("button", { name: "Settings & backups", exact: true })
    .click();
  await page.getByLabel("Owner password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page
    .getByRole("button", { name: "Upload local workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".sync-choice")).toHaveCount(100);
  const merge = dialog.getByRole("button", {
    name: "Keep both histories & merge",
    exact: true,
  });
  await expect(merge).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: /This device/ })).toHaveCount(
    100,
  );
  for (const radio of await dialog
    .getByRole("radio", { name: /This device/ })
    .all())
    await radio.check();
  await expect(merge).toBeDisabled();
  await pager(page, "Sync conflict")
    .getByRole("button", { name: "Next" })
    .click();
  await expect(dialog.locator(".sync-choice")).toHaveCount(1);
  await dialog.getByRole("radio", { name: /This device/ }).check();
  await expect(merge).toBeEnabled();
  await pager(page, "Sync conflict")
    .getByRole("button", { name: "Previous" })
    .click();
  await expect(dialog.locator('input[type="radio"]:checked')).toHaveCount(100);
  await merge.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const s = await new Promise<State>((resolve) => {
      const r = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("owner");
      r.onsuccess = () => resolve(r.result.state);
    });
    db.close();
    return s;
  });
  expect(result.books).toEqual(local.books);
  expect(result.revisions).toEqual(local.revisions);
});

test("guest feedback pagination retains invitation scope and safely appends new feedback", async ({
  page,
}) => {
  const invitationId = "55555555-5555-4555-8555-555555555555",
    chapterId = "22222222-2222-4222-8222-222222222222",
    revisionId = "33333333-3333-4333-8333-333333333333";
  const comments = Array.from({ length: 101 }, (_, i) => ({
    id: crypto.randomUUID(),
    chapter_id: chapterId,
    revision_id: revisionId,
    paragraph_id: null,
    paragraph_label: null,
    chapter_title: "Shared chapter",
    quote: "",
    comment_text: `Guest comment ${i + 1}`,
    created_at: 1,
  }));
  await page.route("**/api/guest/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/exchange"))
      await route.fulfill({ json: { ok: true, invitationId } });
    else if (path.endsWith("/session"))
      await route.fulfill({
        json: {
          invitationId,
          title: "Guest manuscript",
          language: "en",
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          csrf: "guest-fixture",
          chapters: [
            { id: chapterId, title: "Shared chapter", number: 1, revisionId },
          ],
        },
      });
    else if (path.endsWith("/chapter"))
      await route.fulfill({
        json: {
          chapter: {
            id: chapterId,
            title: "Shared chapter",
            number: 1,
            revisionId,
            paragraphs: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                label: 1,
                text: "Shared prose",
                section: "",
              },
            ],
          },
        },
      });
    else if (path.endsWith("/comments")) {
      expect(request.headers()["x-guest-invitation"]).toBe(invitationId);
      if (request.method() === "POST") {
        expect(request.headers()["x-guest-csrf"]).toBe("guest-fixture");
        comments.push({
          ...comments[0],
          id: request.postDataJSON().operationId,
          comment_text: request.postDataJSON().text,
        });
      }
      await route.fulfill({ json: { comments } });
    } else await route.fulfill({ json: {} });
  });
  await page.goto("/guest#token=" + "a".repeat(43));
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Reader feedback",
    exact: true,
  });
  await expect(dialog.locator(".reader-comments article")).toHaveCount(100);
  await pager(page, "Feedback").getByRole("button", { name: "Next" }).click();
  await expect(
    dialog.getByText("Guest comment 101", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Your thoughts").fill("New guest feedback");
  await dialog
    .getByRole("button", { name: "Send feedback", exact: true })
    .click();
  await expect(dialog.locator(".reader-comments article")).toHaveCount(2);
  await expect(
    dialog.getByText("New guest feedback", { exact: true }),
  ).toBeVisible();
});
