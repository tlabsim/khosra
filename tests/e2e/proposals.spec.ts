import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Proposal review");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("khosra-studio-v2");
      request.onsuccess = () => resolve(request.result);
    });
    const tx = database.transaction("workspace", "readwrite");
    const store = tx.objectStore("workspace");
    const request = store.get("owner");
    request.onsuccess = () => {
      const row = request.result as { state: State; version: number };
      const s = row.state,
        chapter = s.chapters[0];
      const revision = s.revisions.find((r) => r.id === chapter.headId)!;
      revision.paragraphs = Array.from({ length: 398 }, (_, i) => ({
        id: crypto.randomUUID(),
        label: i + 1,
        section: "",
        text: `Original paragraph ${i + 1}`,
      }));
      s.proposals = ["First rewrite", "Alternative rewrite"].map((title) => ({
        id: crypto.randomUUID(),
        chapterId: chapter.id,
        baseRevisionId: revision.id,
        title,
        rationale: "Change only the opening.",
        status: "pending",
        createdAt: new Date().toISOString(),
        paragraphs: revision.paragraphs.map((p, i) =>
          i === 0 ? { ...p, text: title } : p,
        ),
      }));
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
});

test("focused review has a separated footer, read-only context and preserves the full chapter", async ({
  page,
}) => {
  const card = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "First rewrite", exact: true }),
  });
  await card.getByRole("button", { name: "Compare before & after" }).click();
  await expect(card.getByRole("textbox")).toHaveCount(1);
  const accept = card.getByRole("button", { name: "Accept this revision" });
  const footer = card.locator("footer");
  expect((await footer.boundingBox())!.y).toBeGreaterThan(
    (await card.getByRole("textbox").boundingBox())!.y,
  );
  expect(
    await footer.evaluate((el) => getComputedStyle(el).borderTopStyle),
  ).toBe("solid");
  if (test.info().project.name === "android") {
    expect(
      (await card.locator(".proposal-status").boundingBox())!.y,
    ).toBeLessThan((await card.getByRole("heading").boundingBox())!.y);
    expect(
      (await card.locator(".proposal-status").boundingBox())!.height,
    ).toBeLessThan(24);
  }
  const context = card.locator(".proposal-context");
  await expect(context).toHaveCount(1);
  await expect(context).not.toHaveAttribute("open", "");
  await context.locator("summary").click();
  await expect(context.locator(".compare-paragraph")).toHaveCount(5);
  await expect(context.getByRole("textbox")).toHaveCount(0);
  await expect(card.getByRole("textbox")).toHaveCount(1);
  await card
    .getByRole("textbox", { name: "Proposed P1", exact: true })
    .fill("Author-edited opening");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${test.info().project.name}-proposal-review.png`,
    fullPage: true,
  });
  await accept.click();
  await expect(card).toHaveCount(0);
  await page
    .getByRole("button", { name: "Accepted proposals", exact: true })
    .click();
  await expect(card.getByText("accepted", { exact: true })).toBeVisible();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const result = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const s = await new Promise<State>((resolve) => {
      const r = database
        .transaction("workspace")
        .objectStore("workspace")
        .get("owner");
      r.onsuccess = () => resolve(r.result.state);
    });
    database.close();
    const chapter = s.chapters[0],
      head = s.revisions.find((r) => r.id === chapter.headId)!;
    const original = s.revisions.find(
      (r) => r.id === s.proposals[0].baseRevisionId,
    )!;
    return {
      count: head.paragraphs.length,
      first: head.paragraphs[0].text,
      last: head.paragraphs[397].text,
      original: original.paragraphs[0].text,
    };
  });
  expect(result).toEqual({
    count: 398,
    first: "Author-edited opening",
    last: "Original paragraph 398",
    original: "Original paragraph 1",
  });
});

test("quick accept works without comparison and blocks the now-stale alternative", async ({
  page,
}) => {
  const card = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "First rewrite", exact: true }),
  });
  await card.getByRole("button", { name: "Accept this revision" }).click();
  await expect(card).toHaveCount(0);
  const alternative = page.locator("section.card").filter({
    has: page.getByRole("heading", {
      name: "Alternative rewrite",
      exact: true,
    }),
  });
  await expect(
    alternative.getByRole("button", { name: "Accept this revision" }),
  ).toBeDisabled();
  await alternative
    .getByRole("button", { name: "Compare before & after" })
    .click();
  await expect(
    alternative.getByRole("button", { name: "Accept this revision" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Manuscript", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.locator(".paper").getByText("First rewrite", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Original paragraph 398", { exact: true }),
  ).toBeAttached();
});

test("status filters default to pending and show accepted/rejected/all with counts", async ({
  page,
}) => {
  const pending = page.getByRole("button", {
    name: "Pending proposals",
    exact: true,
  });
  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await expect(pending).toContainText("2");
  const filters = page.getByRole("group", { name: "Filter proposals" });
  const firstFilter = await filters.getByRole("button").first().boundingBox();
  const lastFilter = await filters.getByRole("button").last().boundingBox();
  expect(lastFilter!.y).toBeCloseTo(firstFilter!.y, 0);
  const first = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "First rewrite", exact: true }),
  });
  await first.getByRole("button", { name: "Accept this revision" }).click();
  await page
    .getByRole("button", { name: "Reject proposal", exact: true })
    .click();
  await expect(
    page.getByText("No pending proposals.", { exact: true }),
  ).toBeVisible();
  await expect(pending).toContainText("0");
  await page
    .getByRole("button", { name: "Accepted proposals", exact: true })
    .click();
  await expect(page.locator("section.card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "First rewrite", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept this revision" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rejected proposals", exact: true })
    .click();
  await expect(page.locator("section.card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Alternative rewrite", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All proposals", exact: true })
    .click();
  await expect(page.locator("section.card")).toHaveCount(2);
});

test("pagination caps cards at 100, clamps shrinking pages, and resets with filters", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("khosra-studio-v2");
      request.onsuccess = () => resolve(request.result);
    });
    const tx = database.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace");
    const request = store.get("owner");
    request.onsuccess = () => {
      const row = request.result as { state: State; version: number };
      const source = row.state.proposals[0];
      row.state.revisions[0].paragraphs =
        row.state.revisions[0].paragraphs.slice(0, 1);
      row.state.proposals = Array.from({ length: 207 }, (_, i) => ({
        ...source,
        id: crypto.randomUUID(),
        title: `Proposal ${i + 1}`,
        status: i < 205 ? "pending" : i === 205 ? "accepted" : "rejected",
        paragraphs: source.paragraphs.slice(0, 1),
      }));
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  const pager = page.getByRole("navigation", {
    name: "Proposal pages (top)",
    exact: true,
  });
  await expect(page.locator("section.card")).toHaveCount(100);
  await expect(pager).toContainText("1–100 of 205 proposals");
  await expect(pager.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pending proposals", exact: true }),
  ).toContainText("205");
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposal 101", exact: true }),
  ).toBeVisible();
  await expect(page.locator("section.card")).toHaveCount(100);
  await page
    .getByRole("navigation", { name: "Proposal pages (bottom)", exact: true })
    .getByRole("button", { name: "Next" })
    .click();
  await expect(page.locator("section.card")).toHaveCount(5);
  await expect(pager).toContainText("Page 3 of 3");
  await expect(pager.getByRole("button", { name: "Next" })).toBeDisabled();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("button", { name: "Reject proposal", exact: true })
      .first()
      .click();
  await expect(pager).toContainText("Page 2 of 2");
  await expect(page.locator("section.card")).toHaveCount(100);
  await page
    .getByRole("button", { name: "All proposals", exact: true })
    .click();
  await expect(pager).toContainText("1–100 of 207 proposals");
  await page
    .getByRole("button", { name: "Accepted proposals", exact: true })
    .click();
  await expect(page.locator("section.card")).toHaveCount(1);
  await expect(pager).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pending proposals", exact: true })
    .click();
  await expect(pager).toContainText("Page 1 of 2");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${test.info().project.name}-proposal-pagination.png`,
    fullPage: false,
  });
});

test("separate middle changes retain five read-only neighbours across comparison versions and keep draft edits", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("khosra-studio-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      r = store.get("owner");
    r.onsuccess = () => {
      const row = r.result as { state: State; version: number };
      const proposal = row.state.proposals[0];
      const original = row.state.revisions.find(
        (r) => r.id === proposal.baseRevisionId,
      )!;
      proposal.paragraphs = original.paragraphs.map((p, i) =>
        i === 199 || i === 299
          ? { ...p, text: `Changed paragraph ${i + 1}` }
          : p,
      );
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  const card = page.locator(".proposal-card").filter({
    has: page.getByRole("heading", { name: "First rewrite", exact: true }),
  });
  await card.getByRole("button", { name: "Compare before & after" }).click();
  await expect(card.getByRole("textbox")).toHaveCount(2);
  await expect(card.locator(".proposal-range")).toHaveCount(2);
  await expect(card.locator(".proposal-context")).toHaveCount(4);
  await expect(card.locator(".proposal-context[open]")).toHaveCount(0);
  await card.locator(".proposal-context").first().locator("summary").click();
  await expect(
    card
      .locator(".proposal-context")
      .first()
      .getByText("Original paragraph 195", { exact: true }),
  ).toBeVisible();
  await expect(
    card.locator(".proposal-context .compare-paragraph"),
  ).toHaveCount(5);
  await expect(card.locator(".proposal-context textarea")).toHaveCount(0);
  await card
    .getByRole("textbox", { name: "Proposed P200", exact: true })
    .fill("Author's middle edit");
  await card.getByRole("button", { name: "Before", exact: true }).click();
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await expect(
    card.getByText("Original paragraph 200", { exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Current manuscript", exact: true })
    .click();
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await expect(
    card.getByText("Original paragraph 300", { exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "After · editable", exact: true })
    .click();
  await expect(
    card.getByRole("textbox", { name: "Proposed P200", exact: true }),
  ).toHaveValue("Author's middle edit");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${test.info().project.name}-proposal-ranges.png`,
    fullPage: true,
  });
  await card
    .getByRole("button", { name: "Close comparison", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manuscript", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.locator(".paper").getByText("Author's middle edit", { exact: true }),
  ).toBeAttached();
  await expect(
    page.locator(".paper").getByText("Original paragraph 398", { exact: true }),
  ).toBeAttached();
});

test("older proposals accept safely after unrelated edits and comparison stays compact", async ({
  page,
}) => {
  // Simulate an already-synced author edit in a different paragraph.
  await page.evaluate(async () => {
    const modulePath = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ modulePath);
    const row = (await db.workspace.get("owner"))!;
    const s = row.state as State,
      c = s.chapters[0],
      base = s.revisions.find((r) => r.id === c.headId)!;
    const revision = {
      ...base,
      id: crypto.randomUUID(),
      parentId: base.id,
      source: "author" as const,
      createdAt: new Date().toISOString(),
      message: "Author changed ending",
      paragraphs: base.paragraphs.map((p, i) =>
        i === 397 ? { ...p, text: "Latest author ending" } : p,
      ),
    };
    c.headId = revision.id;
    s.revisions.push(revision);
    await db.workspace.put({ ...row, version: (row.version || 0) + 1 });
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  const card = page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", { name: "First rewrite", exact: true }),
    });
  const accept = card.getByRole("button", { name: "Accept this revision" });
  await expect(accept).toBeEnabled();
  await card.getByRole("button", { name: "Compare before & after" }).click();
  await card.getByRole("button", { name: "Before", exact: true }).click();
  await expect(card.locator(".comparison-explanation")).toContainText(
    "Text used to create",
  );
  await expect(card.locator(".proposal-range-heading")).toHaveCount(0);
  await expect(card.locator(".compare-paragraph .comparison-id")).toHaveText([
    "P1",
  ]);
  const active = card.getByRole("button", { name: "Before", exact: true });
  expect(
    await active.evaluate((el) => getComputedStyle(el).borderBottomWidth),
  ).toBe("3px");
  await card.locator(".proposal-context summary").click();
  await expect(card.locator(".proposal-context .comparison-id")).toHaveText([
    "P2",
    "P3",
    "P4",
    "P5",
    "P6",
  ]);
  const paragraph = card
    .locator(".proposal-context .compare-paragraph")
    .first();
  expect(
    await paragraph.evaluate((el) => getComputedStyle(el).borderLeftWidth),
  ).toBe("0px");
  expect(
    await paragraph.evaluate((el) =>
      parseFloat(getComputedStyle(el).marginBottom),
    ),
  ).toBeLessThan(10);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `test-results/${test.info().project.name}-compact-comparison.png`,
    fullPage: true,
  });
  await card
    .getByRole("button", { name: "Current manuscript", exact: true })
    .click();
  await expect(card.locator(".comparison-explanation")).toContainText(
    "latest saved draft",
  );
  await accept.click();
  const stored = await page.evaluate(async () => {
    const modulePath = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ modulePath);
    const s = (await db.workspace.get("owner"))!.state as State;
    const c = s.chapters[0];
    return s.revisions.find((r) => r.id === c.headId)!.paragraphs;
  });
  expect(stored[0].text).toBe("First rewrite");
  expect(stored[397].text).toBe("Latest author ending");
});

test("overlapping paragraphs can be resolved explicitly without losing other edits", async ({
  page,
}) => {
  const first = page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", { name: "First rewrite", exact: true }),
    });
  await first.getByRole("button", { name: "Accept this revision" }).click();
  const alternative = page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", {
        name: "Alternative rewrite",
        exact: true,
      }),
    });
  await expect(
    alternative.getByRole("button", { name: "Accept this revision" }),
  ).toBeDisabled();
  await alternative
    .getByRole("button", { name: "Compare before & after" })
    .click();
  await expect(
    alternative.getByRole("textbox", { name: "Proposed P1", exact: true }),
  ).toHaveValue("Alternative rewrite");
  await alternative
    .getByRole("button", { name: "Keep current P1", exact: true })
    .click();
  await expect(alternative.getByRole("textbox")).toHaveCount(0);
  await expect(
    alternative.locator(".proposal-range > .compare-paragraph"),
  ).toContainText("First rewrite");
  await alternative
    .getByRole("button", { name: "Use proposed P1", exact: true })
    .click();
  await alternative
    .getByRole("textbox", { name: "Proposed P1", exact: true })
    .fill("Combined and reviewed opening");
  await expect(
    alternative.getByRole("button", { name: "Accept this revision" }),
  ).toBeEnabled();
  await alternative
    .getByRole("button", { name: "Accept this revision" })
    .click();
  await page
    .getByRole("button", { name: "Manuscript", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page
      .locator(".paper")
      .getByText("Combined and reviewed opening", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Original paragraph 398", { exact: true }),
  ).toBeAttached();
});
