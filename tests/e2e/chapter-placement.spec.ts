import { test, expect, type Page } from "@playwright/test";

async function openAdd(page: Page) {
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Chapter contents" })
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  return page.getByRole("dialog", { name: "New chapter", exact: true });
}

test("insert chapters and a chapter-zero preface without shifting regular reading numbers", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("নতুন গল্প");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  let dialog = await openAdd(page);
  await expect(
    dialog.getByRole("combobox", { name: "Position", exact: true }),
  ).not.toHaveValue("");
  await dialog
    .getByLabel("Chapter title", { exact: true })
    .fill("Second chapter");
  await dialog
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  dialog = await openAdd(page);
  await dialog
    .getByLabel("Chapter title", { exact: true })
    .fill("Inserted opening");
  await dialog
    .getByRole("combobox", { name: "Position", exact: true })
    .selectOption("");
  await dialog
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  dialog = await openAdd(page);
  await dialog
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption("preface");
  await expect(dialog.getByLabel("Chapter title", { exact: true })).toHaveValue(
    "ভূমিকা",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Position", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-add-preface.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Add preface", exact: true })
    .click();
  await expect(page.locator(".chapter-banner .eyebrow")).toContainText("00");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reading-title > span")).toHaveText("অধ্যায় ০");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.locator(".reading-title > span")).toHaveText("অধ্যায় ১");
  await expect(page.locator(".reading-title h1")).toHaveText(
    "Inserted opening",
  );
  await page.getByRole("button", { name: "Back to workspace" }).click();
  dialog = await openAdd(page);
  await expect(
    dialog
      .getByRole("combobox", { name: "Type", exact: true })
      .locator('option[value="preface"]'),
  ).toHaveJSProperty("disabled", true);
  await dialog
    .getByLabel("Chapter title", { exact: true })
    .fill("After the original");
  await dialog
    .getByRole("combobox", { name: "Position", exact: true })
    .selectOption({ label: "After Untitled chapter" });
  await dialog
    .getByRole("button", { name: "Add chapter", exact: true })
    .click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".contents-chapter-title")).toHaveText([
    "ভূমিকা",
    "Inserted opening",
    "Untitled chapter",
    "After the original",
    "Second chapter",
  ]);
  await expect(page.locator(".chapter-index")).toHaveText([
    "00",
    "01",
    "02",
    "03",
    "04",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
