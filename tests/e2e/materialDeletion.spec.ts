import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";
for (const kind of ["idea", "artifact"] as const) {
  test(`author can cancel or permanently delete an ${kind}, retaining unrelated items and shared files`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Begin a manuscript" }).click();
    await page.getByLabel("Working title").fill("Deletion test");
    await page.getByRole("button", { name: "Create manuscript" }).click();
    await page
      .getByRole("button", { name: /^Context/ })
      .filter({ visible: true })
      .first()
      .click();
    const tab = kind === "idea" ? "Ideas" : "Artifacts";
    const openTab = () =>
      page
        .getByRole("navigation", { name: "Context and materials" })
        .getByRole("button", { name: tab, exact: true })
        .click();
    await openTab();
    for (const title of ["Alternative A", "Alternative B"]) {
      await page
        .getByRole("button", { name: `Add ${kind}`, exact: true })
        .click();
      const form = page.getByRole("form", {
        name: kind === "idea" ? "Idea editor" : "Artifact editor",
      });
      await form.getByLabel("Title", { exact: true }).fill(title);
      await form
        .getByLabel(kind === "idea" ? "Idea notes" : "Description and source")
        .fill("A possibility, not manuscript canon.");
      if (kind === "artifact")
        await form.locator("input[type=file]").setInputFiles({
          name: "map.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await form
        .getByRole("button", { name: `Save ${kind}`, exact: true })
        .click();
    }
    const target = page
      .locator(".material-card")
      .filter({
        has: page.getByRole("heading", { name: "Alternative A", exact: true }),
      });
    await target.getByRole("button", { name: `Edit ${kind}` }).click();
    const form = page.getByRole("form", {
      name: kind === "idea" ? "Idea editor" : "Artifact editor",
    });
    await form
      .getByLabel(kind === "idea" ? "Idea notes" : "Description and source")
      .fill("Revised alternative A");
    await form
      .getByRole("button", { name: `Save ${kind}`, exact: true })
      .click();
    await target
      .getByRole("button", { name: `Delete ${kind}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: `Delete ${kind}?` });
    await expect(dialog).toContainText("all its versions");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: `Delete ${kind}`, exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `test-results/${test.info().project.name}-${kind}-delete.png`,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".material-card")).toHaveCount(2);
    await target
      .getByRole("button", { name: `Delete ${kind}`, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: `Delete ${kind}`, exact: true })
      .click();
    await expect(page.locator(".material-card")).toHaveCount(1);
    await expect(page.locator(".material-card")).toContainText("Alternative B");
    await expect(
      page.getByRole("heading", { name: tab, exact: true }),
    ).toBeFocused();
    await expect(page.locator(".saved")).toHaveText("Saved on this device");
    const readState = () =>
      page.evaluate(async () => {
        const path = "/src/storage/db.ts";
        const { db } = await import(/* @vite-ignore */ path);
        return (await db.workspace.get("owner"))!.state as State;
      });
    let stored = await readState();
    expect(stored.materialDeletions).toHaveLength(1);
    expect(stored.materials).toHaveLength(1);
    expect(stored.files).toHaveLength(kind === "artifact" ? 1 : 0);
    await page.reload();
    await page
      .getByRole("button", { name: /^Context/ })
      .filter({ visible: true })
      .first()
      .click();
    await openTab();
    await expect(page.locator(".material-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: `Delete ${kind}`, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: `Delete ${kind}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `No ${tab.toLowerCase()} yet`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".saved")).toHaveText("Saved on this device");
    stored = await readState();
    expect(stored.materials).toEqual([]);
    expect(stored.files).toEqual([]);
    expect(stored.materialDeletions).toHaveLength(2);
    expect(stored.revisions).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
