import { test, expect } from "@playwright/test";
import type { State } from "../../src/domain/model";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("অরণ্যের রহস্য");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  await page.evaluate(async () => {
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const row = await db.workspace.get("owner"),
      s = row.state as State;
    const chapter = s.chapters[0],
      base = s.revisions.find((r) => r.id === chapter.headId)!;
    base.paragraphs = Array.from({ length: 100 }, (_, i) => ({
      id: crypto.randomUUID(),
      label: i + 1,
      section: i === 66 ? "Removed subsection" : "",
      text: `পুরোনো অনুচ্ছেদ ${i + 1}। গ্রামের পথ ধরে এগিয়ে চলে গল্প, বিকেলের আলোয় দূরে দেখা যায় নদী।`,
    }));
    const proposed = base.paragraphs
      .filter((p) => ![67, 68].includes(p.label))
      .map((p) =>
        [43, 45, 65, 90].includes(p.label)
          ? {
              ...p,
              text: `প্রস্তাবিত অনুচ্ছেদ ${p.label}। নতুন ঘটনার সূত্র ধরে এগিয়ে যায় গল্প।`,
            }
          : p,
      );
    proposed.splice(45, 0, {
      id: crypto.randomUUID(),
      label: 101,
      section: "নতুন দৃশ্য",
      text: "প্রস্তাবিত নতুন অনুচ্ছেদ।",
    });
    s.proposals.push({
      id: crypto.randomUUID(),
      chapterId: chapter.id,
      baseRevisionId: base.id,
      title: "অধ্যায়ের নির্বাচিত সংক্ষেপণ",
      rationale: "Four rewrites, two removals and one addition.",
      status: "pending",
      createdAt: new Date().toISOString(),
      paragraphs: proposed,
    });
    const current = {
      ...base,
      id: crypto.randomUUID(),
      parentId: base.id,
      source: "author" as const,
      paragraphs: base.paragraphs.map((p) =>
        p.label === 44
          ? { ...p, text: "লেখকের আলাদা সংশোধন। এই বাক্যটি থাকবে।" }
          : p,
      ),
    };
    current.paragraphs.splice(80, 0, {
      id: crypto.randomUUID(),
      label: 101,
      section: "",
      text: "লেখকের অন্য সংযোজন।",
    });
    s.revisions.push(current);
    chapter.headId = current.id;
    await db.workspace.put({
      ...row,
      state: s,
      version: (row.version || 0) + 1,
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
});
const readState = async (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
    return JSON.stringify((await db.workspace.get("owner")).state);
  });
async function introduceConflict(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const row = await db.workspace.get("owner"),
      s = row.state as State;
    const current = s.revisions.find((r) => r.id === s.chapters[0].headId)!;
    current.paragraphs = current.paragraphs.map((p) =>
      p.label === 43 ? { ...p, text: "Concurrent author rewrite of P43" } : p,
    );
    await db.workspace.put({
      ...row,
      state: s,
      version: (row.version || 0) + 1,
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
}
const review = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Review proposal", exact: true });
test("one continuous review has colors, compact windows, current text, deleted toggle and a persistent footer", async ({
  page,
}) => {
  const before = await readState(page);
  const filters = page.getByRole("group", { name: "Filter proposals" });
  await expect(filters.getByRole("button")).toHaveCount(5);
  const activeTab = filters.getByRole("button", {
    name: "Pending proposals",
    exact: true,
  });
  const activeStyle = await activeTab.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      border: style.borderBottomWidth,
      color: style.borderBottomColor,
      background: style.backgroundColor,
      radius: style.borderRadius,
    };
  });
  expect(activeStyle.border).toBe("4px");
  expect(activeStyle.background).toBe("rgba(0, 0, 0, 0)");
  expect(activeStyle.radius).toBe("0px");
  expect(activeStyle.color).not.toBe("rgba(0, 0, 0, 0)");
  for (const tab of await filters.getByRole("button").all())
    await expect(tab).toBeInViewport();
  const firstTab = await filters.getByRole("button").first().boundingBox();
  const lastTab = await filters.getByRole("button").last().boundingBox();
  const accept = page.getByRole("button", {
    name: "Accept all proposed changes",
    exact: true,
  });
  for (const action of [
    "Review proposal",
    "Accept all proposed changes",
    "Reject this proposal",
  ])
    await expect(
      page.getByRole("button", { name: action, exact: true }).locator("svg"),
    ).toHaveCount(1);
  if (test.info().project.name === "android") {
    expect(lastTab!.y).toBeGreaterThan(firstTab!.y);
    expect(await accept.innerText()).toBe("Accept all");
  } else expect(await accept.innerText()).toBe("Accept all proposed changes");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-proposal-action-icons.png`,
  });
  await expect(page.locator(".proposal-reading-prose")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  const dialog = review(page);
  await expect(
    dialog.locator(".proposal-reading-id").filter({ hasText: /linked/i }),
  ).toHaveCount(0);
  if (test.info().project.name === "android") {
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds!.x).toBeCloseTo(0, 0);
    expect(bounds!.y).toBeCloseTo(0, 0);
    expect(bounds!.width).toBeCloseTo(viewport.width, 0);
    expect(bounds!.height).toBeCloseTo(viewport.height, 0);
    expect(
      await dialog.evaluate((el) => getComputedStyle(el).borderRadius),
    ).toBe("0px");
  }
  await expect(
    dialog.getByRole("button", { name: "Before", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Current manuscript", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".is-removed del")).toHaveCount(2);
  await expect(
    dialog.locator(".is-removed .proposal-reading-original-toggle"),
  ).toHaveCount(0);
  await expect(
    dialog.locator(".is-added button", { hasText: "Show current" }),
  ).toHaveCount(0);
  const changedRow = dialog.locator(".is-changed").first();
  const checkboxBounds = await changedRow
    .locator(".proposal-reading-selection input")
    .boundingBox();
  const idBounds = await changedRow
    .locator(".proposal-reading-id")
    .boundingBox();
  const textBounds = await changedRow
    .locator(".proposal-reading-text")
    .boundingBox();
  expect(checkboxBounds!.x + checkboxBounds!.width).toBeLessThan(idBounds!.x);
  expect(idBounds!.x + idBounds!.width).toBeLessThan(textBounds!.x);
  const idTextTop = await changedRow
    .locator(".proposal-reading-id")
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.firstChild!);
      return range.getBoundingClientRect().top;
    });
  expect(Math.abs(checkboxBounds!.y - idTextTop)).toBeLessThan(12);
  await expect(dialog.locator(".proposal-reading-id input")).toHaveCount(0);
  await changedRow.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-review-checkbox-columns.png`,
  });
  await expect(dialog.getByRole("separator")).toHaveCount(2);
  await expect(dialog.locator(".proposal-reading-id").first()).toHaveText(
    "P38",
  );
  await expect(dialog.locator(".is-added .proposal-reading-id")).toContainText(
    "P102",
  );
  await expect(
    dialog.getByText("লেখকের আলাদা সংশোধন। এই বাক্যটি থাকবে।", { exact: true }),
  ).toBeAttached();
  for (const [selector, color] of [
    [".is-changed", "rgb(49, 95, 145)"],
    [".is-added", "rgb(47, 105, 69)"],
    [".is-removed", "rgb(155, 62, 53)"],
  ])
    expect(
      await dialog
        .locator(`${selector} .proposal-reading-text > p`)
        .first()
        .evaluate((e) => getComputedStyle(e).color),
    ).toBe(color);
  const gap = dialog.getByRole("separator").first();
  expect(await gap.evaluate((e) => getComputedStyle(e).textAlign)).toBe("left");
  expect((await gap.innerText()).split("\n")).toEqual([". . .", ". . ."]);
  await dialog
    .getByRole("checkbox", { name: "Show deleted", exact: true })
    .uncheck();
  await expect(dialog.locator(".is-removed")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Show current P43", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Current P43", exact: true }),
  ).toContainText("পুরোনো অনুচ্ছেদ 43");
  await dialog
    .locator(".sharing-body")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(
    dialog.getByRole("button", {
      name: "Accept all proposed changes",
      exact: true,
    }),
  ).toBeInViewport();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-selective-review.png`,
  });
  expect(await readState(page)).toBe(before);
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review proposal", exact: true }),
  ).toBeFocused();
});
test("partial acceptance confirms, preserves declined and unrelated text, and persists its filter and immutable audit", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  const dialog = review(page);
  await dialog
    .getByRole("checkbox", { name: "Accept all changes", exact: true })
    .uncheck();
  await expect(
    dialog.getByRole("button", { name: /Accept selected/ }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Accept P43", exact: true })
    .check();
  const accept = dialog.getByRole("button", {
    name: "Accept selected (1 of 5)",
    exact: true,
  });
  await expect(accept).toBeEnabled();
  const all = dialog.getByRole("checkbox", {
    name: "Accept all changes",
    exact: true,
  });
  expect(await all.evaluate((e) => (e as HTMLInputElement).indeterminate)).toBe(
    true,
  );
  await accept.click();
  const confirm = page.getByRole("dialog", {
    name: "Accept 1 of 5 changes?",
    exact: true,
  });
  await expect(confirm).toContainText("remaining 4 changes will be declined");
  const footer = confirm.locator(".proposal-confirm-actions");
  expect(
    await footer.evaluate((el) => getComputedStyle(el).borderTopStyle),
  ).toBe("solid");
  const cancelBounds = await footer
    .getByRole("button", { name: "Cancel", exact: true })
    .boundingBox();
  const confirmBounds = await footer
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .boundingBox();
  if (test.info().project.name === "android")
    expect(
      cancelBounds!.y - (confirmBounds!.y + confirmBounds!.height),
    ).toBeGreaterThanOrEqual(9);
  else
    expect(
      confirmBounds!.x - (cancelBounds!.x + cancelBounds!.width),
    ).toBeGreaterThanOrEqual(11);
  expect(await confirm.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-proposal-confirmation-footer.png`,
  });
  await expect(
    confirm.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeVisible();
  await accept.click();
  await confirm
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .dblclick();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Partially accepted proposals", exact: true })
    .click();
  await expect(page.locator(".proposal-status")).toHaveText(
    "partially accepted",
  );
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const state = JSON.parse(await readState(page)) as State;
  const proposal = state.proposals[0],
    result = state.revisions.find((r) => r.id === state.chapters[0].headId)!;
  expect(result.paragraphs.find((p) => p.label === 43)?.text).toContain(
    "প্রস্তাবিত",
  );
  expect(result.paragraphs.find((p) => p.label === 45)?.text).toContain(
    "পুরোনো",
  );
  expect(result.paragraphs.some((p) => p.label === 67)).toBe(true);
  expect(result.paragraphs.some((p) => p.label === 102)).toBe(false);
  expect(result.paragraphs.find((p) => p.label === 44)?.text).toContain(
    "লেখকের",
  );
  expect(result.paragraphs.find((p) => p.label === 101)?.text).toContain(
    "লেখকের",
  );
  expect(proposal.review?.selectedChangeIds).toHaveLength(1);
  expect(proposal.review?.declinedChangeIds).toHaveLength(6);
  expect(proposal.review?.resultRevisionId).toBe(result.id);
  expect(proposal.paragraphs.find((p) => p.label === 45)?.text).toContain(
    "প্রস্তাবিত",
  );
  await page.reload();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Partially accepted proposals", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View reviewed proposal", exact: true })
    .click();
  const reviewed = page.getByRole("dialog", {
    name: "Reviewed proposal",
    exact: true,
  });
  await expect(reviewed.locator(".is-declined")).toHaveCount(6);
  await expect(
    reviewed
      .locator(".proposal-reading-id small")
      .filter({ hasText: "declined" }),
  ).toHaveCount(6);
  await expect(
    reviewed.getByRole("button", {
      name: /Confirm acceptance|Accept selected|Accept all proposed/,
    }),
  ).toHaveCount(0);
});
test("quick acceptance/rejection both require confirmation; cancellation leaves workspace unchanged", async ({
  page,
}) => {
  const initial = await readState(page);
  await page
    .getByRole("button", { name: "Accept all proposed changes", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Accept all 5 proposed changes?",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await readState(page)).toBe(initial);
  await page
    .getByRole("button", { name: "Reject this proposal", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reject this proposal?", exact: true }),
  ).toContainText("manuscript will remain unchanged");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readState(page)).toBe(initial);
  await page
    .getByRole("button", { name: "Reject this proposal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rejection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rejected proposals", exact: true })
    .click();
  const state = JSON.parse(await readState(page)) as State;
  expect(state.proposals[0].status).toBe("rejected");
  expect(state.revisions).toEqual((JSON.parse(initial) as State).revisions);
});
test("conflicting passage can be declined or explicitly resolved inside the single review", async ({
  page,
}) => {
  await introduceConflict(page);
  await expect(
    page.getByRole("button", {
      name: "Accept all proposed changes",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  const dialog = review(page);
  await dialog
    .getByRole("button", { name: "Show current P43", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Current P43", exact: true }),
  ).toContainText("Concurrent author rewrite");
  await dialog
    .getByRole("button", { name: "Keep current P43", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "Accept P43", exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("button", {
      name: "Accept selected (4 of 5)",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("checkbox", { name: "Accept P43", exact: true })
    .check();
  await expect(
    dialog.getByRole("button", {
      name: "Accept all proposed changes",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Use proposed P43", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Accept all proposed changes",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Edit P43", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Proposed P43", exact: true })
    .fill("Author reviewed the proposed opening");
  await dialog
    .getByRole("button", { name: "Done editing", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Accept all proposed changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect(page.locator(".saved")).toHaveText("Saved on this device");
  const state = JSON.parse(await readState(page)) as State;
  expect(state.proposals[0].status).toBe("accepted");
  expect(
    state.revisions
      .find((r) => r.id === state.chapters[0].headId)
      ?.paragraphs.find((p) => p.label === 43)?.text,
  ).toBe("Author reviewed the proposed opening");
});
test("linked deletion group toggles together even when deleted prose is hidden", async ({
  page,
}) => {
  const initial = await readState(page);
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  const dialog = review(page);
  const p67 = dialog.getByRole("checkbox", {
      name: "Accept P67 (linked changes)",
      exact: true,
    }),
    p68 = dialog.getByRole("checkbox", {
      name: "Accept P68 (linked changes)",
      exact: true,
    });
  const deleted = dialog.locator(".is-removed");
  const heading = deleted.getByRole("heading", {
    name: "Removed subsection",
    exact: true,
  });
  await expect(deleted.locator("del")).toHaveCount(2);
  expect(
    await heading.evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toContain("line-through");
  await p67.uncheck();
  await expect(p68).not.toBeChecked();
  await expect(deleted.locator("del")).toHaveCount(0);
  await expect(
    dialog
      .locator(".proposal-reading-id small")
      .filter({ hasText: "declined" }),
  ).toHaveCount(0);
  expect(
    await heading.evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toBe("none");
  await p67.check();
  await expect(p68).toBeChecked();
  await expect(deleted.locator("del")).toHaveCount(2);
  expect(
    await heading.evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toContain("line-through");
  await p67.uncheck();
  await expect(
    dialog.getByRole("button", {
      name: "Accept selected (4 of 5)",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("checkbox", { name: "Show deleted", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", { name: "Accept all changes", exact: true })
    .check();
  await expect(
    dialog.getByRole("button", {
      name: "Accept all proposed changes",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("checkbox", { name: "Show deleted", exact: true })
    .check();
  await expect(p67).toBeChecked();
  await expect(p68).toBeChecked();
  await expect(deleted.locator("del")).toHaveCount(2);
  await p67.uncheck();
  await dialog
    .getByRole("button", { name: "Accept selected (4 of 5)", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Accept 4 of 5 changes?",
    exact: true,
  });
  await expect(confirmation).toContainText(
    "The remaining 1 change will be declined.",
  );
  await expect(confirmation).not.toContainText("1 changes");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(await readState(page)).toBe(initial);
});
