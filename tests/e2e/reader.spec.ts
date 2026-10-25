import { test, expect } from "@playwright/test";
test("rename, compact tools and paginate Bengali without changing text", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("নদীর গল্প");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  const rename = page.getByRole("button", { name: "Rename chapter" });
  await expect(rename.locator("svg")).toHaveCSS("opacity", "1");
  await expect(rename.locator(".rename-caption")).toHaveCSS("opacity", "0");
  if (info.project.name === "desktop") {
    await rename.locator(".rename-chapter").hover();
    await expect(rename.locator(".rename-caption")).toHaveCSS("opacity", "1");
  }
  await page.getByRole("button", { name: "Rename chapter" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("নতুন দুই মুখ");
  await page.getByRole("button", { name: "Save details" }).click();
  const prose = Array.from(
    { length: 160 },
    (_, i) =>
      `[${i + 1}] স্কুলের দোতলার বারান্দায় দাঁড়িয়ে মাঠের দিকে তাকিয়ে আছে ঈশান।`,
  ).join(" ");
  await page.getByRole("button", { name: "Write first paragraph" }).click();
  await page.getByRole("textbox", { name: "Edit paragraph P1" }).fill(prose);
  await page.locator(".paper-heading").click();
  await page.waitForTimeout(900);
  const before = await page
    .locator(".desk-header")
    .evaluate((e) => e.getBoundingClientRect().height);
  const railTop = await page
    .locator(".tool-rail")
    .evaluate((e) => e.getBoundingClientRect().top);
  await page.evaluate(() => window.scrollTo(0, 450));
  await expect(page.locator(".desk-header")).toHaveClass(/is-scrolled/);
  await expect
    .poll(() =>
      page
        .locator(".desk-header")
        .evaluate((e) => e.getBoundingClientRect().height),
    )
    .toBe(56);
  expect(
    await page
      .locator(".tool-rail")
      .evaluate((e) => e.getBoundingClientRect().top),
  ).toBe(railTop);
  expect(
    await page
      .locator(".desk-header")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeLessThan(before);
  await expect(
    page
      .getByRole("navigation", { name: "Chapter workspace" })
      .getByRole("button", { name: "History", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-compact-header.png`,
  });
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reading-book-title")).toHaveText("নদীর গল্প");
  const bookTitleBox = await page.locator(".reading-book-title").boundingBox();
  expect(bookTitleBox!.x + bookTitleBox!.width / 2).toBeCloseTo(
    (await page.evaluate(() => innerWidth)) / 2,
    0,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".reading-text h1")).toHaveText("নতুন দুই মুখ");
  await expect(page.locator(".reading-text p")).toHaveText(prose);
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Margins").selectOption("tight");
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.getByLabel("Reading settings").click();
  await page.getByRole("radio", { name: "Sepia", exact: true }).check();
  await page.getByLabel("Paper texture").selectOption("linen");
  await expect(page.locator(".book-reader")).toHaveClass(
    /paper-sepia texture-linen/,
  );
  await expect(page.locator(".reading-sheet")).toHaveCSS(
    "background-color",
    "rgb(244, 234, 215)",
  );
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  const count = await page.getByLabel("Go to page").locator("option").count();
  expect(count).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByLabel("Go to page")).toHaveValue("1");
  await page.getByRole("region", { name: "Manuscript pages" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Go to page")).toHaveValue("2");
  await page.getByLabel("Reading settings").click();
  await page.getByLabel("Margins").selectOption("relaxed");
  await expect
    .poll(() => page.getByLabel("Go to page").locator("option").count())
    .toBeGreaterThan(count);
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.getByLabel("Reading layout").selectOption("spread");
  if (info.project.name === "desktop")
    await expect(page.locator(".reading-sheet")).toHaveClass(/is-spread/);
  else
    await expect(
      page.getByText("Two pages appear when the window is wider."),
    ).toBeVisible();
  // Pause in the same browser task as the turn, before protocol/trace latency can finish it.
  const pauseTurn = async (direction: string) => {
    await page.evaluate(async (direction) => {
      document
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${direction} page"]`,
        )!
        .click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const leaf = document.querySelector(".turn-leaf");
      if (!leaf) throw new Error("The 3D leaf was not created");
      for (const animation of document
        .querySelector(".page-turn-scene")!
        .getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 340;
      }
    }, direction);
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await pauseTurn("Next");
  await expect(page.locator(".page-turn-scene")).toBeVisible();
  await expect(page.locator(".turn-front .turn-text p")).toHaveText(prose);
  const leafBox = await page
    .locator(".turn-leaf")
    .evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  const sheetBox = await page
    .locator(".reading-sheet")
    .evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  expect(leafBox.height).toBe(sheetBox.height);
  // clientWidth rounds each half of an odd-pixel spread independently.
  expect(
    Math.abs(
      leafBox.width -
        sheetBox.width / (info.project.name === "desktop" ? 2 : 1),
    ),
  ).toBeLessThanOrEqual(0.5);
  await expect(page.locator(".turn-front .turn-folio")).toHaveCount(1);

  await expect(page.locator(".turn-back .turn-text p")).toHaveText(prose);
  expect(
    await page
      .locator(".turn-leaf")
      .evaluate((el) => getComputedStyle(el).transform),
  ).toMatch(/^matrix3d/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-page-turn.png`,
    fullPage: true,
  });
  await page.evaluate(() =>
    document
      .querySelector(".turn-leaf")
      ?.getAnimations()
      .forEach((a) => a.finish()),
  );
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await pauseTurn("Previous");
  await expect(page.locator(".page-turn-scene")).toHaveClass(/turn-backward/);
  await page.evaluate(() =>
    document
      .querySelector(".turn-leaf")
      ?.getAnimations()
      .forEach((a) => a.finish()),
  );
  await expect(page.locator(".page-turn-scene")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-reader.png`,
    fullPage: true,
  });
  // Every text fragment lies in a real column, including the final character.
  const geometry = await page.locator(".reading-text").evaluate((el) => {
    const p = el.querySelector("p")!;
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = Array.from(range.getClientRects());
    const box = el.getBoundingClientRect();
    return {
      bottom: Math.max(...rects.map((r) => r.bottom - box.top)),
      height: box.height,
      fragments: rects.length,
    };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 2);
  expect(geometry.fragments).toBeGreaterThan(20);
  await page.getByLabel("Go to page").selectOption({
    index: (await page.getByLabel("Go to page").locator("option").count()) - 1,
  });
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.locator(".reading-text p").evaluate((el) => {
        const node = el.lastChild!;
        const range = document.createRange();
        range.setStart(node, node.textContent!.length - 1);
        range.setEnd(node, node.textContent!.length);
        const last = range.getBoundingClientRect();
        const frame = el.closest(".reading-viewport")!.getBoundingClientRect();
        return last.left >= frame.left - 1 && last.right <= frame.right + 1;
      }),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.locator(".reading-text")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".page-turn-scene")).toBeHidden();
  const pageBeforeSwipe = Number(
    await page.getByLabel("Go to page").inputValue(),
  );
  await page.locator(".reading-viewport").evaluate((el) => {
    for (const [type, x] of [
      ["touchstart", 200],
      ["touchend", 80],
    ] as const) {
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          changedTouches: [
            new Touch({ identifier: 1, target: el, clientX: x, clientY: 200 }),
          ],
        }),
      );
    }
  });
  await expect
    .poll(async () => Number(await page.getByLabel("Go to page").inputValue()))
    .toBeGreaterThan(pageBeforeSwipe);
  await page.getByLabel("Reading layout").selectOption("continuous");
  await expect(page.locator(".reading-text p")).toHaveText(prose);
  await expect(
    page.getByRole("navigation", { name: "Reading pages" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.reload();
  await expect(page.locator(".paper-heading")).toContainText("নতুন দুই মুখ");
  await expect(page.locator(".paragraph-content p")).toHaveText(prose);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.getByLabel("Reading layout")).toHaveValue("continuous");
  await expect(page.locator(".book-reader")).toHaveClass(
    /paper-sepia texture-linen/,
  );
});
