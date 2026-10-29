import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function manuscript(page: Page, language = "bn") {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Across chapters");
  await page.getByLabel("Manuscript language").selectOption(language);
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("khosra-studio-v2");
      req.onsuccess = () => resolve(req.result);
    });
    const tx = database.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      req = store.get("owner");
    req.onsuccess = () => {
      const row = req.result as { state: State; version: number },
        s = row.state,
        first = s.chapters[0],
        original = s.revisions[0];
      first.title = "First chapter";
      original.paragraphs[0].text =
        "প্রথম অধ্যায়ের গল্প নদীর পাশের গ্রামে শুরু হয়। ".repeat(150);
      const id = crypto.randomUUID(),
        rid = crypto.randomUUID();
      s.chapters.push({
        ...first,
        id,
        title: "Second chapter",
        code: 2,
        position: 1,
        headId: rid,
      });
      s.revisions.push({
        ...original,
        id: rid,
        chapterId: id,
        paragraphs: [
          {
            id: crypto.randomUUID(),
            label: 1,
            section: "",
            text: "দ্বিতীয় অধ্যায়ে একটি নতুন সূত্র পাওয়া যায়। ".repeat(150),
          },
        ],
      });
      store.put({ ...row, version: row.version + 1 });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}
for (const fallback of [false, true])
  test(`${fallback ? "window-filling" : "native fullscreen"} reader keeps fullscreen across chapter changes and resets pagination and scroll`, async ({
    page,
  }) => {
    if (fallback)
      await page.addInitScript(() => {
        Element.prototype.requestFullscreen = () =>
          Promise.reject(new Error("Test unsupported fullscreen"));
      });
    await manuscript(page);
    await expect(
      page.locator(".reading-text .reading-title > span"),
    ).toHaveText("অধ্যায় ১");
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    const reader = page.locator(".book-reader"),
      element = await reader.elementHandle();
    await expect(reader).toHaveClass(/is-immersive/);
    if (!fallback)
      expect(
        await page.evaluate(
          () =>
            document.fullscreenElement ===
            document.querySelector(".book-reader"),
        ),
      ).toBe(true);
    await expect
      .poll(() => page.getByLabel("Go to page").locator("option").count())
      .toBeGreaterThan(1);
    await page.getByLabel("Go to page").selectOption("1");
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".reading-title h1")).toHaveText(
      "Second chapter",
    );
    await expect(reader).toHaveClass(/is-immersive/);
    expect(
      await page.evaluate(
        (old) => old === document.querySelector(".book-reader"),
        element,
      ),
    ).toBe(true);
    if (!fallback)
      expect(
        await page.evaluate(
          () =>
            document.fullscreenElement ===
            document.querySelector(".book-reader"),
        ),
      ).toBe(true);
    await expect(
      page.locator(".reading-text .reading-title > span"),
    ).toHaveText("অধ্যায় ২");
    await expect(page.getByLabel("Go to page")).toHaveValue("0");
    await expect(
      page.getByRole("button", { name: "Next chapter", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Previous chapter", exact: true })
      .click();
    await expect(page.locator(".reading-title h1")).toHaveText("First chapter");
    await expect(reader).toHaveClass(/is-immersive/);
    await expect(page.getByLabel("Go to page")).toHaveValue("0");
    await page.getByLabel("Reading layout").selectOption("continuous");
    await reader.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(() => reader.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(100);
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".reading-title h1")).toHaveText(
      "Second chapter",
    );
    await expect(reader).toHaveClass(/is-immersive/);
    await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(0);
    await page.getByLabel("Reading settings").click();
    await page
      .getByRole("button", { name: "Close reading preferences" })
      .click();
    await page
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
    await expect(reader).not.toHaveClass(/is-immersive/);
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.body).overflowY),
      )
      .not.toBe("hidden");
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).overflowY,
        ),
      )
      .not.toBe("hidden");
  });
test("English manuscript keeps its chapter label", async ({ page }) => {
  await manuscript(page, "en");
  await expect(page.locator(".reading-text .reading-title > span")).toHaveText(
    "CHAPTER 01",
  );
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.locator(".reading-text .reading-title > span")).toHaveText(
    "CHAPTER 02",
  );
});

test("guest chapter loading keeps the same fullscreen reader until the new chapter is ready", async ({
  page,
}) => {
  const ids = [
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const invitationId = "55555555-5555-4555-8555-555555555555";
  let finishLoad!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishLoad = resolve;
  });
  await page.route("**/api/guest/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/exchange"))
      await route.fulfill({ json: { ok: true, invitationId } });
    else if (url.pathname.endsWith("/session"))
      await route.fulfill({
        json: {
          invitationId,
          title: "Guest chapters",
          language: "bn",
          recipient: "Reader",
          csrf: "test-csrf",
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          chapters: ids.map((id, i) => ({
            id,
            title: `Shared ${i + 1}`,
            number: i + 1,
            revisionId: id,
          })),
        },
      });
    else if (url.pathname.endsWith("/chapter")) {
      const i = ids.indexOf(url.searchParams.get("id")!);
      if (i === 1) await loading;
      await route.fulfill({
        json: {
          chapter: {
            id: ids[i],
            title: `Shared ${i + 1}`,
            number: i + 1,
            revisionId: ids[i],
            paragraphs: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                label: 1,
                text: `Shared prose ${i + 1}`,
                section: "",
              },
            ],
          },
        },
      });
    } else await route.fulfill({ json: { comments: [] } });
  });
  await page.goto("/guest#token=" + "a".repeat(43));
  await expect(page.locator(".reading-text")).toContainText("Shared prose 1");
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  const reader = page.locator(".book-reader"),
    element = await reader.elementHandle();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(reader).toHaveAttribute("aria-busy", "true");
  await expect(reader).toHaveClass(/is-immersive/);
  await expect(
    page.getByRole("button", { name: "Next chapter", exact: true }),
  ).toBeDisabled();
  finishLoad();
  await expect(page.locator(".reading-text")).toContainText("Shared prose 2");
  expect(
    await page.evaluate(
      (old) => old === document.querySelector(".book-reader"),
      element,
    ),
  ).toBe(true);
  await expect(reader).toHaveClass(/is-immersive/);
  await expect(reader).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".reading-text .reading-title > span")).toHaveText(
    "অধ্যায় ২",
  );
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(reader).not.toHaveClass(/is-immersive/);
});
