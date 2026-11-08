import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";

test("typing updates the active paragraph without recounting or rendering the whole chapter", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Typing performance fixture");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const req = indexedDB.open("khosra-studio-v2");
    const db = await new Promise<IDBDatabase>((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      get = store.get("owner");
    get.onsuccess = () => {
      const row = get.result as { state: State; version: number };
      const revision = row.state.revisions[0];
      revision.paragraphs = Array.from({ length: 1000 }, (_, i) => ({
        id: crypto.randomUUID(),
        label: i + 1,
        section: "",
        text:
          `TYPING_FIXTURE_${i} একটি পরীক্ষামূলক অনুচ্ছেদ। ` +
          "Synthetic manuscript text. ".repeat(4),
      }));
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator(".paragraph-row")).toHaveCount(1000);
  await page.locator(".paragraph-content > p").first().dblclick();
  const editor = page.getByRole("textbox", {
    name: "Edit paragraph P1",
    exact: true,
  });
  await expect(editor).toBeFocused();
  const result = await editor.evaluate(async (element) => {
    const el = element as HTMLTextAreaElement;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const original = String.prototype.split;
    let recounts = 0;
    String.prototype.split = function (
      this: string,
      ...args: Parameters<typeof original>
    ) {
      if (this.length > 10000 && this.includes("TYPING_FIXTURE_")) recounts++;
      return original.apply(this, args);
    } as typeof original;
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    const before = el.value,
      timings: number[] = [];
    try {
      for (const char of " দ্রুত typing") {
        const start = performance.now();
        set.call(el, el.value + char);
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: char,
          }),
        );
        timings.push(performance.now() - start);
      }
    } finally {
      String.prototype.split = original;
    }
    return { recounts, timings, text: el.value, before };
  });
  await info.attach("typing-profile", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  console.log(
    `${info.project.name} typing profile`,
    JSON.stringify({ recounts: result.recounts, timings: result.timings }),
  );
  expect(result.text).toBe(result.before + " দ্রুত typing");
  expect(result.recounts).toBe(0);
  await editor.press("Escape");
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await expect(page.locator(".paragraph-content > p").first()).toHaveText(
    result.text,
  );
});

test("native draft survives autosave renders, undo, composition and immediate navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Native draft safety");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  const editor = page.getByRole("textbox", {
    name: "Edit paragraph P1",
    exact: true,
  });
  await editor.fill("Original text.");
  await editor.press("Escape");
  await page.locator(".paragraph-content > p").first().dblclick();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(" Added text.");
  const savedText = () =>
    page.evaluate(async () => {
      const req = indexedDB.open("khosra-studio-v2");
      const db = await new Promise<IDBDatabase>((resolve) => {
        req.onsuccess = () => resolve(req.result);
      });
      const get = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("owner");
      const s = await new Promise<State>((resolve) => {
        get.onsuccess = () => resolve(get.result.state);
      });
      db.close();
      return s.revisions.find((r) => r.id === s.chapters[0].headId)!
        .paragraphs[0].text;
    });
  await expect.poll(savedText).toBe("Original text. Added text.");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Original text. Added text.");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveValue("Original text.");
  await editor.evaluate((element) => {
    const el = element as HTMLTextAreaElement;
    el.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    set.call(el, "Original text. বাংলা লেখা।");
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "বাংলা লেখা।",
        isComposing: true,
      }),
    );
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        keyCode: 229,
        isComposing: true,
      }),
    );
    el.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "বাংলা লেখা।",
      }),
    );
  });
  await expect(editor).toHaveValue("Original text. বাংলা লেখা।");
  await expect(page.locator(".paragraph-row")).toHaveCount(1);
  await expect.poll(savedText).toBe("Original text. বাংলা লেখা।");
  await editor.fill("Final draft before navigation.");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reading-text")).toContainText(
    "Final draft before navigation.",
  );
  await expect.poll(savedText).toBe("Final draft before navigation.");
  await page.reload();
  await expect(page.locator(".paragraph-content > p").first()).toHaveText(
    "Final draft before navigation.",
  );
});
