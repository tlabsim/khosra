import type { State } from "../../src/domain/model";
import { test, expect } from "@playwright/test";
async function editParagraph(
  page: import("@playwright/test").Page,
  label: number,
) {
  await page
    .locator(".paragraph-row")
    .filter({
      has: page.getByRole("button", { name: `P${label}`, exact: true }),
    })
    .locator(".paragraph-content > p")
    .dblclick();
}
test("write, flag, propose, accept, revisit, and retain Bengali offline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("চার বন্ধুর রহস্য");
  await page.getByLabel("Rough premise").fill("বাংলাদেশে চার বন্ধুর অভিযান।");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("ঈশান জানালার দিকে তাকাল। রাহুল বলল, “চলো।”");
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await editParagraph(page, 1);
  await page.getByRole("button", { name: "Flag P1", exact: true }).click();
  await page
    .getByLabel("What would you like to revisit?")
    .fill("কথোপকথন আরও স্বাভাবিক করো।");
  await page.getByRole("button", { name: "Save flag", exact: true }).click();
  await editParagraph(page, 1);
  await page.getByRole("button", { name: "Insert after P1" }).click();
  await page
    .getByRole("textbox", { name: "Edit paragraph P2" })
    .fill("বাইরে তখন বৃষ্টি হচ্ছিল।");
  await page.locator(".paper-heading").click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(
    page
      .locator(".paper")
      .getByText("ঈশান জানালার দিকে তাকাল। রাহুল বলল, “চলো।”", {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page.getByText("বাইরে তখন বৃষ্টি হচ্ছিল।", { exact: true }),
  ).toBeVisible();
  const proposal = await page.evaluate(async () => {
    const req = indexedDB.open("khosra-studio-v2");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = database.transaction("workspace");
    const read = tx.objectStore("workspace").get("owner");
    const row = await new Promise<{ state: State }>((resolve) => {
      read.onsuccess = () => resolve(read.result);
    });
    database.close();
    const s = row.state,
      c = s.chapters[0],
      r = s.revisions.find((x) => x.id === c.headId)!;
    return {
      chapterId: c.id,
      baseRevisionId: r.id,
      title: "A gentler conversation",
      rationale: "Requested dialogue adjustment",
      paragraphs: r.paragraphs.map((p, i) =>
        i === 0
          ? { ...p, text: "ঈশান চুপ করে রইল। রাহুল পাশে এসে দাঁড়াল।" }
          : p,
      ),
    };
  });
  const proposals = page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true });
  await proposals.first().click();
  await page
    .getByRole("button", { name: "Import proposal", exact: true })
    .click();
  await page.getByLabel("Proposal JSON").fill(JSON.stringify(proposal));
  await page.getByRole("button", { name: "Validate & import" }).click();
  await page.getByRole("button", { name: "Compare before & after" }).click();
  await page
    .getByRole("textbox", { name: "Proposed P1" })
    .fill("ঈশান চুপ করে রইল। রাহুল তার পাশে দাঁড়াল।");
  await page.getByRole("button", { name: "Accept this revision" }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  const manuscript = page
    .getByRole("button", { name: "Manuscript", exact: true })
    .filter({ visible: true });
  await manuscript.first().click();
  await expect(
    page.getByText("ঈশান চুপ করে রইল। রাহুল তার পাশে দাঁড়াল।", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reader-page")).toBeVisible();
  await expect(page.locator(".paragraph-actions")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  const history = page
    .getByRole("button", { name: "History", exact: true })
    .filter({ visible: true });
  await history.first().click();
  await expect(
    page.getByText("Chapter created", { exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await manuscript.first().click();
  await editParagraph(page, 2);
  await page
    .getByRole("textbox", { name: "Edit paragraph P2" })
    .fill("অফলাইনে লেখা সংরক্ষিত।");
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.context().setOffline(false);
  await page.reload();
  await expect(
    page.getByText("অফলাইনে লেখা সংরক্ষিত।", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-manuscript.png`,
    fullPage: true,
  });
});

test("two tabs cannot silently overwrite each other", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Concurrent writing");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("The first tab’s words.");
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await other
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .click();
  await other
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("The second tab’s unsaved words.");
  await other.locator(".paper-heading").click();
  await expect(other.getByRole("alert")).toContainText("Another tab changed");
  await expect(other.locator(".paper")).toContainText(
    "The second tab’s unsaved words.",
  );
  await page.reload();
  await expect(page.locator(".paper")).toContainText("The first tab’s words.");
  await other.close();
});

test("server conflict review preserves both histories and chosen current text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Conflict review");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", {
      name: /^(Write first paragraph|Edit P1)$/,
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("Author local version.");
  await page.locator(".paper-heading").click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const local = await page.evaluate(async () => {
    const open = indexedDB.open("khosra-studio-v2");
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
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
  const remote = structuredClone(local),
    c = remote.chapters[0],
    r = remote.revisions.find((r) => r.id === c.headId)!;
  const remoteId = "44444444-4444-4444-8444-444444444444";
  remote.revisions = remote.revisions.filter((x) => x.id !== r.id);
  remote.revisions.push({
    ...r,
    id: remoteId,
    paragraphs: r.paragraphs.map((p) => ({
      ...p,
      text: "Server competing version.",
    })),
    message: "Remote author edit",
  });
  c.headId = remoteId;
  let uploads = 0;
  let merged: State | undefined;
  await page.route("**/api/login", (route) =>
    route.fulfill({ json: { csrf: "test-csrf" } }),
  );
  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { state: remote, version: 1 } });
    uploads++;
    if (uploads === 1)
      return route.fulfill({ status: 409, json: { error: "Server changed" } });
    merged = route.request().postDataJSON().state;
    return route.fulfill({ json: { version: 2 } });
  });
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await page.getByLabel("Owner password").fill("test-only");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Upload local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Bring both versions together" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep both histories & merge" }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /This device/ }).check();
  await page
    .getByRole("button", { name: "Keep both histories & merge" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Upload local workspace" }).click();
  await expect.poll(() => uploads).toBe(2);
  expect(merged!.revisions.some((x) => x.id === remoteId)).toBe(true);
  expect(merged!.chapters[0].headId).toBe(local.chapters[0].headId);
});
