import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function savedState(page: Page): Promise<State> {
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
async function paste(page: Page, plain: string, html = "") {
  await page.getByLabel("Chapter text", { exact: true }).evaluate(
    (element, clipboard) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.select();
      const data = new DataTransfer();
      data.setData("text/plain", clipboard.plain);
      if (clipboard.html) data.setData("text/html", clipboard.html);
      textarea.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { plain, html },
  );
}
async function openPaste(page: Page) {
  await page.getByRole("button", { name: "Chapter actions" }).click();
  await page.mouse.click(2, 2);
  await expect(
    page.getByRole("dialog", { name: "Chapter actions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paste or replace chapter text", exact: true })
    .click();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save as a new revision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
}

test("Word paragraphs, manual breaks and duplicate addresses survive chapter replacement", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("নদীর গল্প");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save as a new revision" }),
  ).toBeDisabled();
  await page.getByLabel("Chapter text", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  const paragraphs = [
    "অধ্যায় ১",
    "নতুন দুই মুখ",
    "নদীর ওপারে আলো জ্বলছিল।",
    "প্রথম লাইন।\nদ্বিতীয় লাইন।\n\nচতুর্থ লাইন।",
    "একই কথা।",
    "একই কথা।",
  ];
  const plain = paragraphs
    .map((p) => p.replaceAll("\n", "\u000b"))
    .join("\r\n");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>.MsoNormal{margin:0}</style></head><body><p>Not selected</p><!--StartFragment--><p class="MsoNormal"><span>অধ্যায় ১</span><o:p></o:p></p><h2>নতুন দুই মুখ</h2><p><b>নদীর ওপারে</b> আলো জ্বলছিল।</p><p>প্রথম লাইন।<br>দ্বিতীয় লাইন।<br><br>চতুর্থ লাইন।</p><p>একই কথা।</p><p>একই কথা।</p><p><o:p>&nbsp;</o:p></p><script>window.__pasteExecuted=true</script><img src="/clipboard-trap" onerror="window.__pasteExecuted=true"><p hidden>Hidden text</p><!--EndFragment--><p>Not selected either</p></body></html>`;
  let requests = 0;
  await page.route("**/clipboard-trap", (route) => {
    requests++;
    return route.fulfill({ body: "" });
  });
  await paste(page, plain, html);
  await expect(page.getByLabel("Chapter text", { exact: true })).toHaveValue(
    paragraphs.join("\n\n"),
  );
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "6 paragraphs",
  );
  expect(
    await page.evaluate(
      () => (window as Window & { __pasteExecuted?: boolean }).__pasteExecuted,
    ),
  ).toBeUndefined();
  expect(requests).toBe(0);
  const submit = page.getByRole("button", { name: "Save as a new revision" });
  await submit.scrollIntoViewIfNeeded();
  expect(
    await submit.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        document
          .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          ?.closest("button") === el
      );
    }),
  ).toBe(true);
  await page.getByRole("dialog").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-chapter-paste.png`,
  });
  await page.mouse.click(2, 2);
  await expect(
    page.getByRole("dialog", { name: "Paste a chapter" }),
  ).toBeVisible();
  await expect(page.getByLabel("Chapter text", { exact: true })).toHaveValue(
    paragraphs.join("\n\n"),
  );
  await save(page);
  const first = await savedState(page);
  const chapter = first.chapters[0];
  const revision = first.revisions.find((r) => r.id === chapter.headId)!;
  expect(revision.paragraphs.map((p) => p.text)).toEqual(paragraphs);
  expect(new Set(revision.paragraphs.map((p) => p.id)).size).toBe(6);
  expect(revision.paragraphs.map((p) => p.label)).toEqual([1, 2, 3, 4, 5, 6]);
  await page.getByRole("button", { name: "Chapter actions" }).click();
  await expect(page.getByLabel("Subsection heading P1")).toBeHidden();
  const actions = page.getByRole("dialog", {
    name: "Chapter actions",
    exact: true,
  });
  if (info.project.name === "desktop") {
    for (const height of [600, 720, 900]) {
      await page.setViewportSize({ width: 1280, height });
      expect(
        await actions.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      ).toBe(true);
      const deleteButton = actions.getByRole("button", {
        name: "Delete chapter",
        exact: true,
      });
      expect(
        await deleteButton.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.closest("button") === el
          );
        }),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  } else {
    expect(
      await actions.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-chapter-actions.png`,
  });
  await page.getByText("Subsection headings", { exact: false }).click();
  await expect(page.getByLabel("Subsection heading P1")).toBeVisible();
  await page.getByLabel("Subsection heading P1").fill("Opening");
  await page.getByLabel("Subsection heading P1").press("Tab");
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Chapter actions" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openPaste(page);
  // Editing outside the imported double line break must preserve that break as prose.
  const text = page.getByLabel("Chapter text", { exact: true });
  const edited = ["পরিবর্তিত অধ্যায় ১", ...paragraphs.slice(1)];
  await text.fill(edited.join("\n\n"));
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "6 paragraphs",
  );
  await save(page);
  const second = await savedState(page);
  const next = second.revisions.find(
    (r) => r.id === second.chapters[0].headId,
  )!;
  expect(next.paragraphs.map((p) => p.text)).toEqual(edited);
  expect(next.paragraphs.slice(1)).toEqual(revision.paragraphs.slice(1));
  expect(next.paragraphs[0].id).not.toBe(revision.paragraphs[0].id);
  const subsectionRevision = second.revisions.find(
    (r) => r.id === next.parentId,
  )!;
  expect(subsectionRevision.parentId).toBe(revision.id);
  expect(subsectionRevision.paragraphs[0].section).toBe("Opening");
  expect(second.revisions.find((r) => r.id === revision.id)).toEqual(revision);
  await page.reload();
  await expect(page.locator(".paragraph-row")).toHaveCount(6);
});

test("plain text interpretation, undo paste and selected-range paste remain controllable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Evening pages");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Paste chapter text", exact: true })
    .click();
  const text = page.getByLabel("Chapter text", { exact: true });
  await paste(
    page,
    "First paragraph.\r\nSecond paragraph.\r\nThird paragraph.",
  );
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "3 paragraphs",
  );
  await page.getByLabel("Paragraph breaks").selectOption("blank");
  await expect(text).toHaveValue(
    "First paragraph.\nSecond paragraph.\nThird paragraph.",
  );
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "1 paragraph",
  );
  await page.getByLabel("Paragraph breaks").selectOption("line");
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "3 paragraphs",
  );
  await page.getByLabel("Paragraph breaks").selectOption("auto");
  await expect(text).toHaveValue(
    "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
  );
  await page.getByRole("button", { name: "Undo paste" }).click();
  await expect(text).toHaveValue("");
  await text.fill("Keep this.\n\nReplace this.\n\nKeep that.");
  await text.evaluate((element) => {
    const el = element as HTMLTextAreaElement;
    el.focus();
    el.setSelectionRange(
      el.value.indexOf("Replace"),
      el.value.indexOf("Replace") + "Replace this.".length,
    );
    const data = new DataTransfer();
    data.setData("text/plain", "New one.\nNew two.");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(text).toHaveValue(
    "Keep this.\n\nNew one.\n\nNew two.\n\nKeep that.",
  );
  await expect(page.locator(".paste-paragraph-count")).toHaveText(
    "4 paragraphs",
  );
  await save(page);
  const state = await savedState(page);
  const current = state.revisions.find(
    (r) => r.id === state.chapters[0].headId,
  )!;
  expect(current.paragraphs.map((p) => p.text)).toEqual([
    "Keep this.",
    "New one.",
    "New two.",
    "Keep that.",
  ]);
});
