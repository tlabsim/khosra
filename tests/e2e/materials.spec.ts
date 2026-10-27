import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";
async function openMaterials(
  page: import("@playwright/test").Page,
  kind: "Ideas" | "Artifacts",
) {
  await page
    .getByRole("button", { name: /^Context/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Context and materials" })
    .getByRole("button", { name: kind, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("The vanished witness");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
});
test("manuscript ideas can be planned, linked, versioned and discarded without changing prose", async ({
  page,
}) => {
  await openMaterials(page, "Ideas");
  await page.getByRole("button", { name: "Add idea", exact: true }).click();
  const form = page.getByRole("form", { name: "Idea editor" });
  await form
    .getByLabel("Title", { exact: true })
    .fill("The witness staged the disappearance");
  await form
    .getByLabel("Idea notes")
    .fill("A possible progression, not a fact.");
  await form.getByLabel("Status", { exact: true }).selectOption("planned");
  await form.getByRole("checkbox").first().check();
  await form.getByRole("button", { name: "Save idea", exact: true }).click();
  const card = page.locator(".material-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".status-pill")).toHaveText("planned");
  await expect(card).toContainText("C1:");
  await card.getByRole("button", { name: "Edit idea" }).click();
  await form
    .getByLabel("Idea notes")
    .fill("The author reconsiders the ending.");
  await form.getByLabel("Status", { exact: true }).selectOption("discarded");
  await form.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Material status").selectOption("discarded");
  await expect(card).toHaveCount(1);
  await card.locator("summary").click();
  await expect(card.locator(".material-history")).toHaveCount(2);
  await expect(card).toContainText("A possible progression, not a fact.");
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await openMaterials(page, "Ideas");
  await page.getByLabel("Material status").selectOption("all");
  await expect(page.locator(".material-card")).toContainText(
    "The author reconsiders the ending.",
  );
  const stored = await page.evaluate(async () => {
    const modulePath = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ modulePath);
    return (await db.workspace.get("owner"))!.state;
  });
  expect(stored.materials).toHaveLength(2);
  expect(stored.contexts).toHaveLength(0);
  expect(stored.revisions).toHaveLength(1);
});
test("private images preview, download, survive reload and remain in archived history", async ({
  page,
}) => {
  await openMaterials(page, "Artifacts");
  await page.getByRole("button", { name: "Add artifact", exact: true }).click();
  const form = page.getByRole("form", { name: "Artifact editor" });
  await form.getByLabel("Title", { exact: true }).fill("Village map");
  await form
    .getByLabel("Description and source")
    .fill("Drawn during our planning chat.");
  await form.getByLabel("Reference URL").fill("https://example.test/village");
  const mapData = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f4efdf";
    ctx.fillRect(0, 0, 1200, 800);
    ctx.strokeStyle = "#45614e";
    ctx.lineWidth = 8;
    for (const [x, y, w, h] of [
      [100, 100, 400, 240],
      [620, 100, 450, 240],
      [100, 450, 400, 240],
      [620, 450, 450, 240],
    ])
      ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#45614e";
    ctx.font = "40px serif";
    ctx.fillText("Village reference map", 100, 55);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await form
    .locator("input[type=file]")
    .setInputFiles({
      name: "village.png",
      mimeType: "image/png",
      buffer: Buffer.from(mapData, "base64"),
    });
  await form
    .getByRole("button", { name: "Save artifact", exact: true })
    .click();
  const card = page.locator(".material-card");
  await expect(
    card.getByRole("img", { name: "Village map", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("img", { name: "Village map", exact: true }),
  ).toHaveJSProperty("naturalWidth", 1200);
  await expect(
    card.getByRole("link", { name: "Open reference" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "village.png", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("village.png");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `test-results/${test.info().project.name}-artifacts.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card.getByRole("button", { name: "Edit artifact" }).click();
  await form.getByLabel("Status", { exact: true }).selectOption("archived");
  await form
    .getByRole("button", { name: "Save artifact", exact: true })
    .click();
  await page.getByLabel("Material status").selectOption("archived");
  await expect(card).toHaveCount(1);
  await card.locator("summary").click();
  await expect(
    card.getByRole("button", { name: "Download version attachment" }),
  ).toHaveCount(2);
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await openMaterials(page, "Artifacts");
  await page.getByLabel("Material status").selectOption("archived");
  await expect(
    page
      .locator(".material-card")
      .getByRole("img", { name: "Village map", exact: true }),
  ).toBeVisible();
});
test("rejects unsafe or oversized attachments and keeps the form", async ({
  page,
}) => {
  await openMaterials(page, "Artifacts");
  await page.getByRole("button", { name: "Add artifact", exact: true }).click();
  const form = page.getByRole("form", { name: "Artifact editor" });
  await form.getByLabel("Title", { exact: true }).fill("Unsafe file");
  await form.locator("input[type=file]").setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg><script/></svg>"),
  });
  await form
    .getByRole("button", { name: "Save artifact", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("does not match");
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsafe file",
  );
  await expect(page.locator(".material-card")).toHaveCount(0);
  await form.locator("input[type=file]").setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(2097153),
  });
  await form
    .getByRole("button", { name: "Save artifact", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("2 MiB");
});
test("materials work without chapters and paginate at 100", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const modulePath = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ modulePath);
    const row = (await db.workspace.get("owner"))!;
    const s = row.state as State;
    s.chapters = [];
    s.revisions = [];
    s.materials = Array.from({ length: 101 }, (_, i) => {
      const id = crypto.randomUUID();
      return {
        id,
        itemId: id,
        parentId: null,
        bookId: s.books[0].id,
        kind: "idea",
        title: `Idea ${i + 1}`,
        body: "Possible direction",
        chapterIds: [],
        status: "idea",
        fileId: null,
        url: "",
        createdAt: new Date().toISOString(),
        source: "model",
      };
    });
    await db.workspace.put({ ...row, version: (row.version || 0) + 1 });
  });
  await page.reload();
  await openMaterials(page, "Ideas");
  await expect(page.locator(".material-card")).toHaveCount(100);
  await page
    .getByRole("navigation", { name: "Idea pages (top)" })
    .getByRole("button", { name: "Next" })
    .click();
  await expect(page.locator(".material-card")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Idea pages (top)" }),
  ).toContainText("Page 2 of 2");
  await page.getByRole("button", { name: "Add idea", exact: true }).click();
  await expect(page.getByRole("form")).toContainText("Manuscript-wide");
});
