import { test, expect } from "@playwright/test";
test("desktop rail spacing and five-button mobile navigation", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("A quiet manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  const nav = page.getByRole("navigation", { name: "Chapter workspace" });
  await expect(nav.getByRole("button")).toHaveCount(
    info.project.name === "desktop" ? 7 : 5,
  );
  for (const name of ["Manuscript", "Flags", "Proposals", "History", "Context"])
    await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
  if (info.project.name === "desktop") {
    for (const width of [1280, 1600, 1000, 800]) {
      await page.setViewportSize({ width, height: 900 });
      const rail = await nav.boundingBox(),
        paper = await page.locator(".paper").boundingBox();
      expect(paper!.x - rail!.x - rail!.width).toBeCloseTo(24, 1);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "test-results/desktop-navigation.png" });
    await nav.getByRole("button", { name: "Share manuscript" }).click();
    const dialog = page.getByRole("dialog", { name: "Share for reading" });
    await expect(dialog.locator(".sharing-manuscript")).toContainText(
      "A quiet manuscript",
    );
    await page.getByRole("button", { name: "Close sharing dialog" }).click();
    await expect(
      nav.getByRole("button", { name: "Share manuscript" }),
    ).toBeFocused();
    const add = nav.getByRole("button", { name: "Add chapter", exact: true });
    const addBox = await add.boundingBox(),
      railBox = await nav.boundingBox();
    expect(addBox!.y).toBeGreaterThan(railBox!.y + railBox!.height);
    await add.click();
    await page
      .getByLabel("Chapter title", { exact: true })
      .fill("The next morning");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add chapter", exact: true })
      .click();
    await expect(
      page
        .getByRole("heading", { name: "The next morning", exact: true })
        .first(),
    ).toContainText("The next morning");
    await expect(page.getByRole("status")).toHaveText("Saved on this device");
    await page.reload();
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(page.locator(".contents-library")).toBeHidden();
    await page
      .getByRole("complementary", { name: "Chapter contents" })
      .getByRole("button", { name: /The next morning/ })
      .click();
    await expect(
      page
        .getByRole("heading", { name: "The next morning", exact: true })
        .first(),
    ).toBeVisible();
    return;
  }
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 839 });
    await expect(
      nav.getByRole("button", { name: "Share manuscript" }),
    ).toHaveCount(0);
    const bar = await nav.boundingBox();
    expect(bar!.width).toBeCloseTo(width - 24, 1);
    const ordered = await nav.locator("button").evaluateAll((buttons) =>
      buttons
        .map((b) => ({
          name: b.getAttribute("aria-label"),
          x: b.getBoundingClientRect().x,
        }))
        .sort((a, b) => a.x - b.x)
        .map((b) => b.name),
    );
    expect(ordered).toEqual([
      "Flags",
      "Proposals",
      "Manuscript",
      "History",
      "Context",
    ]);
    const manuscript = await nav
      .getByRole("button", { name: "Manuscript", exact: true })
      .boundingBox();
    expect(manuscript!.x + manuscript!.width / 2).toBeCloseTo(width / 2, 1);
    for (const button of await nav.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({
    path: "test-results/mobile-navigation-five-buttons.png",
  });
  for (const [name, heading] of [
    ["Flags", "No flags yet"],
    ["Proposals", "No proposals yet"],
    ["History", "No earlier revisions"],
    ["Context", "No context index yet"],
    ["Manuscript", "This chapter is empty"],
  ]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button")).toHaveCount(5);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("mobile contents keeps chapter creation and library access above navigation", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "android", "Mobile drawer regression");
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Pocket manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const drawer = page.getByRole("complementary", { name: "Chapter contents" });
  const libraryBox = await drawer
    .getByRole("button", { name: "Back to library", exact: true })
    .boundingBox();
  const addBox = await drawer
    .getByRole("button", { name: "Add chapter", exact: true })
    .boundingBox();
  expect(libraryBox!.y).toBeGreaterThanOrEqual(addBox!.y + addBox!.height);
  await page.screenshot({ path: "test-results/mobile-contents-actions.png" });
  await drawer
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  await page
    .getByLabel("Chapter title", { exact: true })
    .fill("A second chapter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "A second chapter", exact: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Back to library", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Manuscripts", exact: true }),
  ).toBeVisible();
});
