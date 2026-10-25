import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function state(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const request = indexedDB.open("khosra-studio-v2");
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
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
test("paragraph editing supports continuous writing, joins and recoverable deletion", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Evening pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  const first = page.getByRole("textbox", { name: "Edit paragraph P1" });
  await first.fill("প্রথম কথা। Second half.");
  await first.evaluate((el) =>
    (el as HTMLTextAreaElement).setSelectionRange(10, 10),
  );
  await first.press("Enter");
  const second = page.getByRole("textbox", { name: "Edit paragraph P2" });
  await expect(second).toBeFocused();
  const suffix = "প্রথম কথা। Second half.".slice(10);
  await expect(second).toHaveValue(suffix);
  await second.press("ControlOrMeta+End");
  await second.press("Enter");
  const third = page.getByRole("textbox", { name: "Edit paragraph P3" });
  await expect(third).toBeFocused();
  await third.fill("Third paragraph.");
  await third.press("ControlOrMeta+End");
  await third.press("Shift+Enter");
  await page.keyboard.insertText("Manual line.");
  await expect(third).toHaveValue("Third paragraph.\nManual line.");
  await expect(page.locator(".paragraph-row")).toHaveCount(3);
  await third.press("Enter");
  const fourth = page.getByRole("textbox", { name: "Edit paragraph P4" });
  await expect(fourth).toBeFocused();
  await fourth.press("Backspace");
  await expect(third).toBeFocused();
  await third.press("ControlOrMeta+Home");
  await third.press("Backspace");
  await expect(second).toBeFocused();
  await expect(second).toHaveValue(suffix + "Third paragraph.\nManual line.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".paragraph-edit-controls")).toHaveCount(0);
  await expect(page.locator(".paragraph-actions")).toHaveCount(0);
  const paragraphs = page.locator(".paragraph-content > p");
  await expect(paragraphs).toHaveCount(2);
  const gap = await paragraphs.evaluateAll(
    (ps) =>
      ps[1].getBoundingClientRect().top - ps[0].getBoundingClientRect().bottom,
  );
  expect(gap).toBeLessThanOrEqual(12);
  await paragraphs.nth(1).dblclick();
  await expect(second).toBeFocused();
  await expect(
    page.getByRole("toolbar", { name: "Paragraph P2 tools" }),
  ).toBeVisible();
  await second.fill("Unsaved deleted draft — রাখা হলো।");
  await page.getByRole("button", { name: "Delete paragraph P2" }).click();
  await expect(second).toHaveValue("Unsaved deleted draft — রাখা হলো।");
  await page.getByRole("button", { name: "Confirm delete P2" }).click();
  await expect(page.locator(".paragraph-edit-controls")).toHaveCount(0);
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const saved = await state(page),
    current = saved.revisions.find((r) => r.id === saved.chapters[0].headId)!;
  expect(current.paragraphs).toHaveLength(1);
  expect(current.paragraphs[0].label).toBe(1);
  expect(
    saved.revisions.some((r) =>
      r.paragraphs.some((p) => p.text === "Unsaved deleted draft — রাখা হলো।"),
    ),
  ).toBe(true);
  expect(
    saved.revisions.find((r) => r.parentId === null)!.paragraphs[0].text,
  ).toBe("");
  await page.screenshot({
    path: `test-results/${info.project.name}-paragraphs-idle.png`,
  });
  await paragraphs.first().focus();
  await page.keyboard.press("Enter");
  await expect(first).toBeFocused();
  await first.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator(".paragraph-row")).toHaveCount(1);
  await first.press("ControlOrMeta+End");
  await first.evaluate((el) =>
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertParagraph",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const next = page.getByRole("textbox", { name: "Edit paragraph P5" });
  await expect(next).toBeFocused();
  await next.fill("আরেকটি অনুচ্ছেদ।");
  await page.screenshot({
    path: `test-results/${info.project.name}-paragraph-editing.png`,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.locator(".paragraph-row")).toHaveCount(2);
  await expect(page.locator(".paragraph-edit-controls")).toHaveCount(0);
  expect(
    (await state(page)).revisions.some((r) =>
      r.paragraphs.some((p) => p.text === "আরেকটি অনুচ্ছেদ।"),
    ),
  ).toBe(true);
});

test("empty paragraphs, clear, confirmed delete and individual history recovery", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Recoverable pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  const first = page.getByRole("textbox", { name: "Edit paragraph P1" });
  await first.fill("আগের অনুচ্ছেদ।");
  await first.press("ControlOrMeta+End");
  await first.press("Enter");
  const second = page.getByRole("textbox", { name: "Edit paragraph P2" });
  await second.press("Escape");
  await page.getByRole("button", { name: "Remove empty paragraph P2" }).click();
  await expect(page.locator(".paragraph-row")).toHaveCount(1);
  await expect(page.locator(".paragraph-edit-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.locator(".history-row").filter({ hasText: "Removed empty" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Deleted & cleared" }).click();
  await expect(page.locator(".history-passage")).toHaveCount(0);
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await page.locator(".paragraph-content > p").dblclick();
  await first.press("ControlOrMeta+End");
  await first.press("Enter");
  const third = page.getByRole("textbox", { name: "Edit paragraph P3" });
  await third.fill("মাঝের অনুচ্ছেদ।");
  await third.press("ControlOrMeta+End");
  await third.press("Enter");
  const fourth = page.getByRole("textbox", { name: "Edit paragraph P4" });
  await fourth.fill("শেষ অনুচ্ছেদ।");
  await fourth.press("Escape");
  const middle = page
    .locator(".paragraph-row")
    .filter({ has: page.getByRole("button", { name: "P3", exact: true }) });
  await middle.locator("p").dblclick();
  await third.fill("Latest unsaved middle — বাংলা।");
  await page.getByRole("button", { name: "Clear text in P3" }).click();
  await expect(third).toHaveValue("");
  await expect(page.locator(".paragraph-row")).toHaveCount(3);
  await third.press("Escape");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Deleted & cleared" }).click();
  const cleared = page
    .locator(".history-passage")
    .filter({ hasText: "Latest unsaved middle — বাংলা।" });
  await expect(cleared).toContainText("Text cleared");
  await cleared.getByRole("button", { name: "Restore paragraph" }).click();
  await expect(
    cleared.getByRole("button", { name: "Already in manuscript" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await middle.locator("p").dblclick();
  await page.getByRole("button", { name: "Delete paragraph P3" }).click();
  await expect(third).toHaveValue("Latest unsaved middle — বাংলা।");
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear text in P3" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel delete" }).click();
  await expect(third).toBeFocused();
  await page.getByRole("button", { name: "Delete paragraph P3" }).click();
  await page.keyboard.press("Escape");
  await expect(third).toBeFocused();
  await page.getByRole("button", { name: "Delete paragraph P3" }).click();
  const alignment = await page.locator(".confirming-delete").evaluate((el) => {
    const last = el.querySelector("button:last-child")!;
    return (
      el.getBoundingClientRect().right - last.getBoundingClientRect().right
    );
  });
  expect(alignment).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: `test-results/${info.project.name}-delete-confirm.png`,
  });
  await page.getByRole("button", { name: "Confirm delete P3" }).click();
  await expect(page.locator(".paragraph-row")).toHaveCount(2);
  await expect(page.locator(".paragraph-edit-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Deleted & cleared" }).click();
  const deleted = page
    .locator(".history-passage")
    .filter({ hasText: "Latest unsaved middle — বাংলা।" })
    .filter({ hasText: "Deleted" });
  await expect(deleted).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-paragraph-recovery.png`,
  });
  await deleted.getByRole("button", { name: "Restore paragraph" }).click();
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await expect(page.locator(".paragraph-content > p")).toHaveText([
    "আগের অনুচ্ছেদ।",
    "Latest unsaved middle — বাংলা।",
    "শেষ অনুচ্ছেদ।",
  ]);
  await expect(middle).toBeVisible();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await expect(middle).toContainText("Latest unsaved middle — বাংলা।");
});

test("recent history shows three concise chapter entries and opens earlier revisions", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "The right margin panel is a wide-screen feature.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("History beside the page");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  const first = page.getByRole("textbox", { name: "Edit paragraph P1" });
  await first.fill("Original first paragraph.");
  await first.press("ControlOrMeta+End");
  await first.press("Enter");
  await page
    .getByRole("textbox", { name: "Edit paragraph P2" })
    .fill("Second paragraph.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const panel = page.getByRole("region", { name: "Recent history" });
  const entries = panel.locator(".recent-history-item");
  await expect(entries).toHaveCount(3);
  await entries.nth(1).click();
  await expect(
    page.getByRole("button", { name: "Return to current" }),
  ).toBeVisible();
  await expect(page.locator(".paragraph-editor")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-recent-history.png`,
  });
  await page.getByRole("button", { name: "Return to current" }).click();
  await expect(page.locator(".paragraph-content > p")).toHaveText([
    "Original first paragraph.",
    "Second paragraph.",
  ]);
  await panel.getByRole("button", { name: "All history" }).click();
  await expect(
    page.getByRole("heading", { name: "Revision history" }),
  ).toBeVisible();
});
