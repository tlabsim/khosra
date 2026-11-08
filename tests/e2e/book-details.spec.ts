import { test, expect } from "@playwright/test";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWioAAAAASUVORK5CYII=";

test("manuscript details can be edited from Contents, cancelled, reloaded and displayed with a cover", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Original manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const row = page.locator(".contents-book-title");
  if (info.project.name === "desktop") await row.hover();
  const edit = page.getByRole("button", { name: "Edit manuscript details" });
  await expect(edit).toHaveCSS("opacity", "1");
  await edit.click();
  const modal = page.getByRole("dialog", { name: "Manuscript details" });
  await modal.getByLabel("Manuscript name").fill("Cancelled change");
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toContainText("Original manuscript");
  await edit.click();
  await modal.getByLabel("Manuscript name").fill("  নিখোঁজ জাদুকর  ");
  await modal
    .getByLabel("Premise", { exact: true })
    .fill("A young magician disappears.");
  await modal.getByLabel("Manuscript language").selectOption("en");
  await modal.getByLabel("Cover image").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(modal.getByAltText("Manuscript cover preview")).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-manuscript-details.png`,
  });
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText("নিখোঁজ জাদুকর");
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await page.getByRole("button", { name: "Open navigation" }).click();
  if (info.project.name === "desktop") await row.hover();
  await edit.click();
  await expect(modal.getByLabel("Manuscript name")).toHaveValue(
    "নিখোঁজ জাদুকর",
  );
  await expect(modal.getByLabel("Premise", { exact: true })).toHaveValue(
    "A young magician disappears.",
  );
  await expect(modal.getByLabel("Manuscript language")).toHaveValue("en");
  await expect(modal.getByAltText("Manuscript cover preview")).toBeVisible();
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close contents" }).click();
  await page.getByRole("link", { name: "Khosra library", exact: true }).click();
  const tile = page.getByRole("button", {
    name: "Open নিখোঁজ জাদুকর",
    exact: true,
  });
  await expect(tile.locator("img")).toBeVisible();
  await expect(tile).toContainText("নিখোঁজ জাদুকর");
  await tile.click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  if (info.project.name === "desktop") await row.hover();
  await edit.click();
  await modal.getByRole("button", { name: "Remove cover" }).click();
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await page.getByRole("button", { name: "Open navigation" }).click();
  if (info.project.name === "desktop") await row.hover();
  await edit.click();
  await expect(modal.getByAltText("Manuscript cover preview")).toHaveCount(0);
});

test("detail dialogs keep unsaved fields when their backdrop is clicked", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Original name");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  if (info.project.name === "desktop")
    await page.locator(".contents-book-title").hover();
  await page.getByRole("button", { name: "Edit manuscript details" }).click();
  const manuscript = page.getByRole("dialog", { name: "Manuscript details" });
  await manuscript
    .getByLabel("Manuscript name")
    .fill("Unsaved manuscript title");
  await page.locator(".modal-backdrop").click({ position: { x: 3, y: 3 } });
  await expect(manuscript).toBeVisible();
  await expect(manuscript.getByLabel("Manuscript name")).toHaveValue(
    "Unsaved manuscript title",
  );
  await manuscript.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close contents" }).click();
  await page.getByRole("button", { name: "Rename chapter" }).click();
  const chapter = page.getByRole("dialog", { name: "Chapter details" });
  await chapter
    .getByLabel("Title", { exact: true })
    .fill("Unsaved chapter title");
  await page.locator(".modal-backdrop").click({ position: { x: 3, y: 3 } });
  await expect(chapter).toBeVisible();
  await expect(chapter.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved chapter title",
  );
  await chapter.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "Untitled chapter", exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rename chapter" }).click();
  await page.keyboard.press("Escape");
  await expect(chapter).toHaveCount(0);
});
