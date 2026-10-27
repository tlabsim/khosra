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
        createdAt: new Date(Date.UTC(2026, 9, 27, 0, 0, i)).toISOString(),
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
  await expect(page.locator("section.card h3").first()).toHaveText(
    "Proposal 205",
  );
  await expect(pager).toContainText("1–100 of 205 proposals");
  await expect(pager.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pending proposals", exact: true }),
  ).toContainText("205");
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("section.card h3").first()).toHaveText(
    "Proposal 105",
  );
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
  for (let i = 0; i < 5; i++) {
    await page
      .getByRole("button", { name: "Reject this proposal", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Confirm rejection", exact: true })
      .click();
  }
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

test("accepted proposal changes tint paragraph IDs, retain unrelated author edits and clear after rewriting that paragraph", async ({
  page,
}) => {
  const card = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "First rewrite", exact: true }),
  });
  await card
    .getByRole("button", { name: "Accept all proposed changes" })
    .click();
  await page
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manuscript", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const p1 = page
    .locator(".paragraph-row")
    .filter({ has: page.locator(".paragraph-id").filter({ hasText: /^P1$/ }) });
  const p2 = page
    .locator(".paragraph-row")
    .filter({ has: page.locator(".paragraph-id").filter({ hasText: /^P2$/ }) });
  const id1 = p1.locator(".paragraph-id"),
    id2 = p2.locator(".paragraph-id");
  await expect(id1).toHaveClass(/proposal-changed/);
  await expect(id1).toHaveAttribute(
    "aria-description",
    "Changed by an accepted proposal",
  );
  await expect(id2).not.toHaveClass(/proposal-changed/);
  expect(await id1.evaluate((e) => getComputedStyle(e).color)).not.toBe(
    await id2.evaluate((e) => getComputedStyle(e).color),
  );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-proposal-paragraph-mark.png`,
  });
  await p2.locator(".paragraph-content > p").press("Enter");
  await page
    .getByRole("textbox", { name: "Edit paragraph P2", exact: true })
    .fill("Unrelated author change");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(id1).toHaveClass(/proposal-changed/);
  await expect(id2).not.toHaveClass(/proposal-changed/);
  await page.reload();
  await expect(page.locator(".paragraph-id.proposal-changed")).toHaveCount(1);
  await p1.locator(".paragraph-content > p").press("Enter");
  await page
    .getByRole("textbox", { name: "Edit paragraph P1", exact: true })
    .fill("Author replacement for accepted text");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(id1).not.toHaveClass(/proposal-changed/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
