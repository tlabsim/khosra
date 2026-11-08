import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function manuscript(
  page: Page,
  language = "bn",
  preface = false,
  repeats = 150,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Across chapters");
  await page.getByLabel("Manuscript language").selectOption(language);
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(
    async ({ preface, repeats }) => {
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
        if (preface) first.code = 0;
        original.paragraphs[0].text =
          "প্রথম অধ্যায়ের গল্প নদীর পাশের গ্রামে শুরু হয়। ".repeat(repeats);
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
    },
    { preface, repeats },
  );
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
    await page.getByLabel("Go to page").selectOption({ value: "1" });
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
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
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
      "First chapter",
    );
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
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
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

test("desktop chapter shortcuts sit below Add chapter and save edits before switching", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop workspace shortcuts");
  await manuscript(page);
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  const shortcuts = page.getByRole("group", { name: "Switch chapter" });
  const previous = shortcuts.getByRole("button", { name: "Previous chapter" });
  const next = shortcuts.getByRole("button", { name: "Next chapter" });
  await expect(previous).toBeDisabled();
  const add = await page.locator(".workspace-add-chapter").boundingBox();
  const combined = await shortcuts.boundingBox();
  expect(combined!.y).toBeGreaterThan(add!.y + add!.height);
  expect(combined!.height).toBeLessThan(add!.height);
  await page.locator(".paragraph-content > p").first().dblclick();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("Preserved before chapter switch.");
  await next.click();
  await expect(page.locator(".title-button h1")).toHaveText("Second chapter");
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(page.locator(".title-button h1")).toHaveText("First chapter");
  await expect(page.locator(".paragraph-content > p").first()).toHaveText(
    "Preserved before chapter switch.",
  );
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await expect(page.locator(".paragraph-content > p").first()).toHaveText(
    "Preserved before chapter switch.",
  );
  await page.getByRole("button", { name: "Flags", exact: true }).click();
  await next.click();
  await expect(
    page.getByRole("button", { name: "Flags", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(next).toBeDisabled();
  await page.screenshot({ path: "test-results/desktop-chapter-shortcuts.png" });
});

test("continuous reader keeps chapter navigation visible while scrolling and in fullscreen", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Use focus mode"));
  });
  await manuscript(page);
  await page.getByLabel("Reading layout").selectOption("continuous");
  const nav = page.getByRole("navigation", { name: "Reading chapters" });
  const previous = nav.getByRole("button", { name: "Previous chapter" });
  const next = nav.getByRole("button", { name: "Next chapter" });
  await expect(previous).toBeDisabled();
  const assertSticky = async () => {
    const bounds = await nav.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBeGreaterThanOrEqual(viewport.width - 20);
    expect(bounds!.y).toBeGreaterThan(viewport.height - 100);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe(
      "fixed",
    );
  };
  await assertSticky();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight / 2),
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await assertSticky();
  await next.click();
  await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
    "Second chapter",
  );
  await expect(next).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  const reader = page.locator(".book-reader");
  await expect(reader).toHaveClass(/is-immersive/);
  await reader.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await assertSticky();
  await previous.click();
  await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
    "First chapter",
  );
  await expect(reader).toHaveClass(/is-immersive/);
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(0);
  await reader.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const last = await page.locator(".reading-text p").last().boundingBox();
  const bar = await nav.boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y);
  await page.screenshot({
    path: `test-results/${info.project.name}-continuous-chapter-navigation.png`,
  });
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.getByLabel("Reading layout").selectOption("pages");
  await expect(nav).not.toHaveCSS("position", "fixed");
});

test("short preface opens on the right without adding a numbered blank page", async ({
  page,
}, info) => {
  await manuscript(page, "bn", true, 1);
  await page.getByLabel("Reading layout").selectOption("spread");
  await expect(page.locator(".reading-text .reading-title > span")).toHaveCount(
    0,
  );
  const blank = page.locator(".reading-blank-verso");
  const rightHand = info.project.name === "desktop";
  await expect(blank).toHaveCount(rightHand ? 1 : 0);
  const title = await page
    .locator(".reading-text .reading-title")
    .boundingBox();
  const paper = await page.locator(".reading-sheet").boundingBox();
  if (rightHand) expect(title!.x).toBeGreaterThan(paper!.x + paper!.width / 2);
  await expect(page.getByLabel("Go to page").locator("option")).toHaveText([
    "1",
  ]);
  await expect(page.locator(".page-navigation")).toContainText("of 1 pages");
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".reading-folios > span")).toHaveText(
    rightHand ? ["", "1"] : ["1"],
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-preface-right-opening.png`,
  });
  await page.getByLabel("Reading layout").selectOption("pages");
  await expect(blank).toHaveCount(0);
  await expect(page.locator(".reading-folios > span")).toHaveText(["1"]);
  await page.getByLabel("Reading layout").selectOption("continuous");
  await expect(blank).toHaveCount(0);
  await expect(page.locator(".reading-text p")).toHaveCount(1);
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.getByLabel("Reading layout").selectOption("spread");
  await expect(blank).toHaveCount(0);
  await expect(page.locator(".reading-text .reading-title > span")).toHaveText(
    "অধ্যায় ১",
  );
});

test("long preface paginates and turns back to its right-hand opening", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Needs two visible pages");
  await manuscript(page, "bn", true);
  await page.getByLabel("Reading layout").selectOption("spread");
  await expect
    .poll(() => page.getByLabel("Go to page").locator("option").count())
    .toBeGreaterThan(1);
  await expect(page.getByLabel("Go to page")).toHaveValue("0");
  await expect(page.locator(".reading-folios > span")).toHaveText(["", "1"]);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".reading-folios > span")).toHaveText(["2", "3"]);
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await expect(page.locator(".reading-folios > span")).toHaveText(["", "1"]);
  const title = await page
    .locator(".reading-text .reading-title")
    .boundingBox();
  const paper = await page.locator(".reading-sheet").boundingBox();
  expect(title!.x).toBeGreaterThan(paper!.x + paper!.width / 2);
});

for (const layout of ["pages", "spread"])
  test(`page controls cross chapters and return to the final ${layout} view`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error("Use focus mode"));
    });
    await manuscript(page);
    await page.getByLabel("Reading layout").selectOption(layout);
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    const selector = page.getByLabel("Go to page");
    await expect
      .poll(() => selector.locator("option").count())
      .toBeGreaterThan(1);
    let last: string | null = null;
    const nextPage = page.getByRole("button", {
      name: "Next page",
      exact: true,
    });
    const previousPage = page.getByRole("button", {
      name: "Previous page",
      exact: true,
    });
    // Fullscreen may repaginate after ResizeObserver measures the toolbar.
    await expect
      .poll(async () => {
        last = await selector.locator("option").last().getAttribute("value");
        await selector.selectOption({ value: last! });
        return nextPage.getAttribute("title");
      })
      .toBe("Next chapter");
    await expect(nextPage).toBeEnabled();
    await nextPage.click();
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
      "Second chapter",
    );
    await expect(page.locator(".book-reader")).toHaveClass(/is-immersive/);
    await expect(selector).toHaveValue("0");
    await expect(previousPage).toBeEnabled();
    await expect(previousPage).toHaveAttribute("title", "Previous chapter");
    await previousPage.click();
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
      "First chapter",
    );
    await expect(selector).toHaveValue(last!);
    await selector.selectOption("0");
    await expect(previousPage).toBeDisabled();
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".reading-text .reading-title h1")).toHaveText(
      "Second chapter",
    );
    await expect
      .poll(async () => {
        const secondLast = await selector
          .locator("option")
          .last()
          .getAttribute("value");
        await selector.selectOption({ value: secondLast! });
        return nextPage.isDisabled();
      })
      .toBe(true);
  });

for (const layout of ["pages", "spread"]) {
  test(`chapter switches animate old and new paper faces in ${layout}`, async ({
    page,
  }, info) => {
    await manuscript(page, "en", true, 1);
    await page.getByLabel("Reading layout").selectOption(layout);
    await expect(
      page.locator(".reading-text .reading-title > span"),
    ).toHaveCount(0);
    // Freeze the animation as soon as its leaf is mounted, before protocol latency.
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const scene = document.querySelector(".page-turn-scene");
        if (!scene) return;
        for (const animation of scene.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 300;
        }
      });
      observer.observe(document.querySelector(".book-reader")!, {
        childList: true,
        subtree: true,
      });
      Object.assign(window, {
        stopTurnObservation: () => observer.disconnect(),
      });
    });
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".page-turn-scene")).toHaveClass(/turn-forward/);
    await expect(page.locator(".turn-front h1")).toHaveText("First chapter");
    await expect(page.locator(".turn-back h1")).toHaveText("Second chapter");
    await expect(
      page.locator(".reading-text .reading-title > span"),
    ).toHaveText("CHAPTER 01");
    await page.screenshot({
      path: `test-results/${info.project.name}-${layout}-chapter-turn.png`,
    });
    await page.evaluate(() => {
      for (const a of document
        .querySelector(".page-turn-scene")!
        .getAnimations({ subtree: true }))
        a.finish();
    });
    await expect(page.locator(".page-turn-scene")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Previous page", exact: true })
      .click();
    await expect(page.locator(".page-turn-scene")).toHaveClass(/turn-backward/);
    await expect(page.locator(".turn-front h1")).toHaveText("Second chapter");
    await expect(page.locator(".turn-back h1")).toHaveText("First chapter");
    await expect(page.locator(".turn-back .turn-folio")).toHaveText("1");
    await page.evaluate(() => {
      (
        window as unknown as { stopTurnObservation: () => void }
      ).stopTurnObservation();
      for (const a of document
        .querySelector(".page-turn-scene")!
        .getAnimations({ subtree: true }))
        a.finish();
    });
    await expect(page.locator(".page-turn-scene")).toHaveCount(0);
    // Cancel a frozen chapter flip by changing layout, then navigate again.
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const scene = document.querySelector(".page-turn-scene");
        if (!scene) return;
        for (const a of scene.getAnimations({ subtree: true })) a.pause();
      });
      observer.observe(document.querySelector(".book-reader")!, {
        childList: true,
        subtree: true,
      });
      Object.assign(window, {
        stopTurnObservation: () => observer.disconnect(),
      });
    });
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".page-turn-scene")).toHaveCount(1);
    await page.getByLabel("Reading layout").selectOption("continuous");
    await expect(page.locator(".page-turn-scene")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Previous chapter", exact: true })
      .click();
    await expect(page.locator(".reading-text h1")).toHaveText("First chapter");
    await page.evaluate(() =>
      (
        window as unknown as { stopTurnObservation: () => void }
      ).stopTurnObservation(),
    );
    await page.getByLabel("Reading layout").selectOption(layout);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(page.locator(".reading-text h1")).toHaveText("Second chapter");
    await expect(page.locator(".page-turn-scene")).toHaveCount(0);
    await expect(page.getByLabel("Go to page")).toHaveValue("0");
  });
}

test("screen-sized paper fills portrait and narrow landscape viewports and persists", async ({
  page,
}, info) => {
  await manuscript(page);
  const original = await page.locator(".reading-text p").allTextContents();
  const adapt = page.getByRole("button", {
    name: "Adapt to screen size",
    exact: true,
  });
  const fullscreen = page.getByRole("button", {
    name: "Enter fullscreen",
    exact: true,
  });
  await expect(adapt).toHaveAttribute("aria-pressed", "false");
  const adaptBox = await adapt.boundingBox(),
    fullscreenBox = await fullscreen.boundingBox();
  expect(adaptBox!.x + adaptBox!.width).toBeLessThanOrEqual(fullscreenBox!.x);
  await adapt.click();
  await expect(adapt).toHaveAttribute("aria-pressed", "true");
  const root = page.locator(".book-reader"),
    sheet = page.locator(".reading-sheet");
  for (const [width, height] of [
    [390, 844],
    [667, 375],
    [1280, 720],
    [900, 1200],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(root).toHaveClass(/is-screen-sized/);
    await expect
      .poll(() => sheet.evaluate((el) => [el.clientWidth, el.clientHeight]))
      .toEqual([width, height]);
    if (width > height) await expect(sheet).toHaveClass(/is-spread/);
    else await expect(sheet).not.toHaveClass(/is-spread/);
    const sizes = await page.evaluate(() => {
      const reader = document.querySelector<HTMLElement>(".book-reader")!;
      const paper = document.querySelector<HTMLElement>(".reading-sheet")!;
      const text = document.querySelector<HTMLElement>(".reading-text")!;
      return {
        rootX: reader.getBoundingClientRect().x,
        rootY: reader.getBoundingClientRect().y,
        overflow: reader.scrollHeight - reader.clientHeight,
        column: parseFloat(getComputedStyle(text).columnWidth),
        inset: parseFloat(getComputedStyle(paper).paddingLeft),
      };
    });
    expect(sizes.rootX).toBe(0);
    expect(sizes.rootY).toBe(0);
    expect(sizes.overflow).toBeLessThanOrEqual(1);
    expect(sizes.column + 2 * sizes.inset).toBeCloseTo(
      width / (width > height ? 2 : 1),
      0,
    );
    const folios = page.locator(".reading-folios > span");
    await expect(folios).toHaveText(width > height ? ["1", "2"] : ["1"]);
    for (let index = 0; index < (await folios.count()); index++) {
      await expect(folios.nth(index)).toBeVisible();
      const bounds = await folios.nth(index).boundingBox();
      const center =
        width > height ? width * (index === 0 ? 0.25 : 0.75) : width / 2;
      expect(bounds!.x + bounds!.width / 2).toBeCloseTo(center, 0);
      expect(height - bounds!.y - bounds!.height).toBeLessThan(18);
    }
    const next = page.getByRole("button", { name: "Next page", exact: true });
    const box = await next.boundingBox();
    expect(box!.x + box!.width).toBe(width);
    expect(box!.y + box!.height / 2).toBeCloseTo(height / 2, 0);
    expect(box!.width).toBe(44);
    await expect(next.locator("svg")).toHaveCSS("opacity", "0.18");
    await expect(page.locator(".reading-text p")).toHaveText(original);
    await page.mouse.move(0, height - 1);
    await page.screenshot({
      path: `test-results/${info.project.name}-screen-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet).not.toHaveClass(/is-spread/);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const leaf = page.locator(".turn-single .turn-leaf");
  await expect(leaf).toHaveCSS("animation-name", "screen-page-away");
  await leaf.evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 120;
  });
  await expect(leaf).toHaveCSS("--screen-turn-shift", "-16px");
  const opacity = await leaf.evaluate((el) =>
    Number(getComputedStyle(el).opacity),
  );
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  await page.screenshot({
    path: `test-results/${info.project.name}-screen-phone-turn.png`,
  });
  await leaf.evaluate((el) => el.getAnimations()[0].finish());
  await expect(leaf).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(leaf).toHaveCSS("--screen-turn-shift", "16px");
  await expect(leaf).toHaveCount(0);
  await expect(page.getByLabel("Go to page")).toHaveValue("0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const nextPage = page.getByRole("button", { name: "Next page", exact: true });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    if (await nextPage.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(nextPage).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }).locator("svg"),
  ).toHaveCSS("opacity", "0.7");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByLabel("Go to page")).not.toHaveValue("0");
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(root).toHaveClass(/is-screen-sized/);
  await page.getByRole("button", { name: "Exit screen-sized reading" }).click();
  await expect(root).not.toHaveClass(/is-screen-sized/);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Page format").selectOption("screen");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.keyboard.press("Escape");
  await expect(root).not.toHaveClass(/is-screen-sized/);
});
