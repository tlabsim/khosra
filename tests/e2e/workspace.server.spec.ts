import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { checkPasswordReveal } from "./password";
import {
  emptyState,
  addChapter,
  uid,
  now,
  head,
  type State,
} from "../../src/domain/model";
function fixture() {
  const s = emptyState(),
    id = uid();
  s.books.push({
    id,
    title: "Laptop draft",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  return addChapter(s, id, "Opening");
}
function serverFixture(state = emptyState()) {
  let current = state,
    version = 0;
  const operations = new Map<string, number>();
  const attach = async (context: BrowserContext) => {
    let authenticated = false,
      offline = false;
    await context.route("**/api/**", async (route) => {
      if (offline) {
        await route.abort("failed");
        return;
      }
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      if (path === "/api/login") {
        if (body.password !== "owner-test-password") {
          await route.fulfill({
            status: 401,
            json: { error: "Incorrect owner password." },
          });
          return;
        }
        authenticated = true;
        await route.fulfill({ json: { csrf: "test-csrf" } });
        return;
      }
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          json: { error: "Owner session required." },
        });
        return;
      }
      if (path === "/api/session") {
        await route.fulfill({ json: { csrf: "test-csrf" } });
        return;
      }
      if (path === "/api/logout") {
        authenticated = false;
        await route.fulfill({ json: { ok: true } });
        return;
      }
      if (path === "/api/workspace") {
        if (request.method() === "POST") {
          if (operations.has(body.operationId)) {
            await route.fulfill({
              json: { version: operations.get(body.operationId) },
            });
            return;
          }
          if (body.baseVersion !== version) {
            await route.fulfill({
              status: 409,
              json: { error: "Server workspace changed" },
            });
            return;
          }
          current = body.state;
          version++;
          operations.set(body.operationId, version);
          await route.fulfill({ json: { version } });
          return;
        }
        await route.fulfill({ json: { state: current, version } });
        return;
      }
      await route.fulfill({ status: 404, json: { error: "Not found" } });
    });
    return {
      offline: (value: boolean) => {
        offline = value;
      },
      expire: () => {
        authenticated = false;
      },
    };
  };
  return {
    attach,
    state: () => current,
    remote: (s: State) => {
      current = s;
      version++;
    },
  };
}
async function signIn(page: Page) {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page
    .getByLabel("Owner password", { exact: true })
    .fill("owner-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function write(page: Page, text: string) {
  const paragraph = page.locator(".paragraph-content > p").first();
  if (await paragraph.count()) await paragraph.dblclick();
  else
    await page
      .getByRole("button", { name: /^(Write first paragraph|Edit P1)$/ })
      .click();
  await page.getByRole("textbox", { name: "Edit paragraph P1" }).fill(text);
  await page.locator(".paper-heading").click();
}

test("login, automatic saving and another device opening the same manuscript", async ({
  page,
  context,
  browser,
}, info) => {
  const server = serverFixture();
  await server.attach(context);
  let finishSessionCheck!: () => void;
  const sessionCheck = new Promise<void>((resolve) => {
    finishSessionCheck = resolve;
  });
  await page.route("**/api/session", async (route) => {
    await sessionCheck;
    await route.fallback();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Opening your workspace" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Connecting to your workspace…",
  );
  finishSessionCheck();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".access-host")).toHaveText("Running locally");
  await expect(
    page.getByRole("button", { name: "Begin a manuscript" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-sign-in.png`,
    fullPage: true,
  });
  await checkPasswordReveal(page, "Owner password", "owner-test-password");
  await signIn(page);
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("Shared manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await write(page, "সার্ভারে রাখা প্রথম খসড়া।");
  await expect
    .poll(() => server.state().revisions.at(-1)?.paragraphs[0].text)
    .toBe("সার্ভারে রাখা প্রথম খসড়া।");
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  const other = await browser.newContext({
    viewport: { width: 412, height: 839 },
    isMobile: true,
    hasTouch: true,
  });
  await server.attach(other);
  const phone = await other.newPage();
  await phone.goto("http://127.0.0.1:5180/");
  await signIn(phone);
  await expect(
    phone.getByRole("button", { name: "Open navigation" }),
  ).toContainText("Shared manuscript");
  await expect(phone.locator(".paragraph-content")).toContainText(
    "সার্ভারে রাখা প্রথম খসড়া।",
  );
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-server-workspace.png`,
    fullPage: true,
  });
  // Navigation must flush the editor's debounce before signing out or changing views.
  await page.locator(".paragraph-content > p").first().dblclick();
  await page
    .getByRole("textbox", { name: "Edit paragraph P1" })
    .fill("Last keystrokes before settings");
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await expect
    .poll(
      () => head(server.state(), server.state().chapters[0]).paragraphs[0].text,
    )
    .toBe("Last keystrokes before settings");
  await expect(
    page.getByRole("heading", { name: "Workspace & sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload local workspace" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-server-settings.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".paper")).toHaveCount(0);
  await other.close();
});

test("an existing device-only draft is retained until explicitly moved online", async ({
  page,
  context,
}) => {
  const server = serverFixture(),
    local = fixture();
  await server.attach(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.evaluate(async (state) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("khosra-studio-v2");
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put({ id: "owner", state, version: 1 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, local);
  await page.reload();
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Bring your draft onto the server" }),
  ).toBeVisible();
  expect(server.state().books).toHaveLength(0);
  await page
    .getByRole("button", { name: "Continue with this device’s draft" })
    .click();
  await expect.poll(() => server.state().books[0]?.title).toBe("Laptop draft");
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bring your draft onto the server" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toContainText("Laptop draft");
});

test("remote model proposals refresh automatically and expired sessions require sign-in", async ({
  page,
  context,
}) => {
  const source = fixture(),
    server = serverFixture(source),
    auth = await server.attach(context);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  const c = source.chapters[0],
    r = head(source, c);
  server.remote({
    ...source,
    proposals: [
      {
        id: uid(),
        chapterId: c.id,
        baseRevisionId: r.id,
        title: "Voice discussion revision",
        rationale: "A suggestion saved through chat",
        paragraphs: [{ ...r.paragraphs[0], text: "Suggested prose" }],
        status: "pending",
        createdAt: now(),
      },
    ],
  });
  // No manual download: the normal foreground polling cycle receives the proposal.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          return new Promise<number>((resolve) => {
            const q = indexedDB.open("khosra-studio-v2");
            q.onsuccess = () => {
              const db = q.result,
                tx = db.transaction("workspace"),
                r = tx.objectStore("workspace").get("owner");
              r.onsuccess = () => {
                resolve(r.result?.state.proposals.length || 0);
                db.close();
              };
            };
          });
        }),
      { timeout: 16000 },
    )
    .toBe(1);
  await page
    .getByRole("navigation", { name: "Chapter workspace" })
    .getByRole("button", { name: "Proposals", exact: true })
    .click();
  await expect(
    page.getByText("Voice discussion revision", { exact: true }),
  ).toBeVisible();
  auth.expire();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Voice discussion revision", { exact: true }),
  ).toHaveCount(0);
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
});

test("offline edits and simultaneous device edits require review without losing either history", async ({
  page,
  context,
  browser,
}, info) => {
  const source = fixture(),
    server = serverFixture(source),
    laptop = await server.attach(context);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  const other = await browser.newContext();
  await server.attach(other);
  const phone = await other.newPage();
  await phone.goto("http://127.0.0.1:5180/");
  await signIn(phone);
  await expect(phone.locator(".server-sync")).toContainText("Saved to server");
  laptop.offline(true);
  await write(page, "Laptop offline text");
  await expect(page.locator(".server-sync")).toContainText(
    "waiting for server",
  );
  await write(phone, "Phone online text");
  await expect
    .poll(
      () => head(server.state(), server.state().chapters[0]).paragraphs[0].text,
    )
    .toBe("Phone online text");
  laptop.offline(false);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Laptop offline text");
  await expect(dialog).toContainText("Phone online text");
  await dialog.locator('.sync-choice input[type="radio"]').first().check();
  await page.screenshot({
    path: `test-results/${info.project.name}-server-conflict.png`,
  });
  await dialog
    .getByRole("button", { name: "Keep both histories & merge" })
    .click();
  await expect
    .poll(
      () => head(server.state(), server.state().chapters[0]).paragraphs[0].text,
    )
    .toBe("Laptop offline text");
  expect(
    server
      .state()
      .revisions.some((r) => r.paragraphs[0].text === "Phone online text"),
  ).toBe(true);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await other.close();
});

test("a stale browser tab cannot replace work saved by another tab", async ({
  page,
  context,
}) => {
  const source = fixture(),
    server = serverFixture(source);
  await server.attach(context);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".server-sync")).toContainText("Saved to server");
  await write(page, "Newest tab text");
  await expect
    .poll(
      () => head(server.state(), server.state().chapters[0]).paragraphs[0].text,
    )
    .toBe("Newest tab text");
  if (
    await other.getByRole("button", { name: "Sync now", exact: true }).count()
  )
    await other.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "Workspace unavailable" }),
  ).toBeVisible();
  await expect(other.getByRole("status")).toContainText("Another tab updated");
  expect(
    head(server.state(), server.state().chapters[0]).paragraphs[0].text,
  ).toBe("Newest tab text");
  await other.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(other.locator(".paragraph-content")).toContainText(
    "Newest tab text",
  );
});

test("full and partial proposal acceptance autosave without a false other-tab conflict", async ({
  page,
  context,
  browser,
}) => {
  const source = fixture(),
    c = source.chapters[0],
    base = head(source, c);
  base.paragraphs = [
    { ...base.paragraphs[0], text: "Original opening" },
    { id: uid(), label: 2, section: "", text: "Original ending" },
  ];
  source.proposals = [
    {
      id: uid(),
      chapterId: c.id,
      baseRevisionId: base.id,
      title: "First accepted proposal",
      rationale: "Rewrite opening",
      status: "pending",
      createdAt: now(),
      paragraphs: base.paragraphs.map((p, i) =>
        i === 0 ? { ...p, text: "Accepted opening" } : p,
      ),
    },
    {
      id: uid(),
      chapterId: c.id,
      baseRevisionId: base.id,
      title: "Partially accepted proposal",
      rationale: "Two independent suggestions",
      status: "pending",
      createdAt: now(),
      paragraphs: base.paragraphs.map((p, i) => ({
        ...p,
        text: i === 0 ? "Declined opening" : "Accepted ending",
      })),
    },
  ];
  const server = serverFixture(source);
  await server.attach(context);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await page
    .getByRole("navigation", { name: "Chapter workspace" })
    .getByRole("button", { name: "Proposals", exact: true })
    .click();
  const first = page.locator(".proposal-card").filter({
    has: page.getByRole("heading", {
      name: "First accepted proposal",
      exact: true,
    }),
  });
  await first
    .getByRole("button", { name: "Accept all proposed changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect
    .poll(() => server.state().proposals[0].status, { timeout: 7000 })
    .toBe("accepted");
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review proposal",
    exact: true,
  });
  await review
    .getByRole("checkbox", { name: "Accept P1", exact: true })
    .uncheck();
  await review
    .getByRole("button", { name: "Accept selected (1 of 2)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect
    .poll(() => server.state().proposals[1].status, { timeout: 7000 })
    .toBe("partially-accepted");
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  expect(
    head(server.state(), server.state().chapters[0]).paragraphs.map(
      (p) => p.text,
    ),
  ).toEqual(["Accepted opening", "Accepted ending"]);
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
    )
    .not.toBe("hidden");
  await expect(
    page.getByRole("button", {
      name: "Partially accepted proposals",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Accepted proposals", exact: true })
    .click();
  await expect(page.locator(".proposal-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Accepted proposals", exact: true }),
  ).toContainText("2");
  await expect(page.locator(".proposal-status")).toHaveText([
    "partially accepted",
    "accepted",
  ]);
  const revisions = server.state().revisions.length;
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await page.reload();
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  expect(server.state().revisions).toHaveLength(revisions);
  const other = await browser.newContext();
  await server.attach(other);
  const device = await other.newPage();
  await device.goto("http://127.0.0.1:5180/");
  await signIn(device);
  await expect(device.locator(".server-sync")).toContainText("Saved to server");
  await expect(device.locator(".paper")).toContainText("Accepted opening");
  await expect(device.locator(".paper")).toContainText("Accepted ending");
  await other.close();
});

test("new-chapter suggestions require confirmation and preserve the author-edited draft across devices", async ({
  page,
  context,
  browser,
}, info) => {
  const state = emptyState(),
    bid = uid();
  state.books.push({
    id: bid,
    title: "Unwritten mystery",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  state.chapterProposals = ["The station clock", "Alternative beginning"].map(
    (title, i) => ({
      id: uid(),
      bookId: bid,
      title,
      synopsis: "An investigator arrives",
      rationale: "Open with a new clue",
      afterChapterId: null,
      paragraphs: [
        { id: uid(), label: 1, section: "", text: "স্টেশনের ঘড়িটি থেমে ছিল।" },
        { id: uid(), label: 2, section: "", text: "তবু ট্রেনটি সময়মতো এল।" },
      ],
      status: "pending",
      createdAt: new Date(Date.UTC(2026, 9, 29, 0, 0, i)).toISOString(),
    }),
  );
  const server = serverFixture(state);
  await server.attach(context);
  await page.goto("/");
  await signIn(page);
  if (
    await page.getByRole("button", { name: "Open Unwritten mystery" }).count()
  )
    await page.getByRole("button", { name: "Open Unwritten mystery" }).click();
  await expect(
    page.getByRole("heading", { name: "No chapters yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Proposals/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator(".proposal-card")).toHaveCount(2);
  expect(server.state().chapters).toHaveLength(0);
  const rejected = page.locator(".proposal-card").filter({
    has: page.getByRole("heading", {
      name: "Alternative beginning",
      exact: true,
    }),
  });
  await rejected.getByRole("button", { name: "Reject this proposal" }).click();
  let confirmation = page.getByRole("dialog", {
    name: "Reject this chapter proposal?",
    exact: true,
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    server.state().chapterProposals.every((p) => p.status === "pending"),
  ).toBe(true);
  await rejected.getByRole("button", { name: "Reject this proposal" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm rejection" })
    .click();
  await expect
    .poll(
      () =>
        server
          .state()
          .chapterProposals.find((p) => p.title === "Alternative beginning")
          ?.status,
    )
    .toBe("rejected");
  expect(server.state().chapters).toHaveLength(0);
  const card = page.locator(".proposal-card");
  await card.getByRole("button", { name: "Review new chapter" }).click();
  const review = page.getByRole("dialog", {
    name: "New chapter proposal",
    exact: true,
  });
  await review.getByLabel("Proposed chapter title").fill("Author’s opening");
  await review
    .getByLabel("Proposed chapter synopsis")
    .fill("The author’s revised outline");
  await review
    .getByLabel("New chapter paragraph P1")
    .fill("লেখকের পরিমার্জিত সূচনা।");
  await expect(review.getByLabel("New chapter position")).toHaveValue("");
  if (info.project.name === "android") {
    const rect = await review.boundingBox();
    expect(rect?.x).toBe(0);
    expect(rect?.width).toBe(page.viewportSize()!.width);
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-new-chapter-review.png`,
  });
  await review
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  confirmation = page.getByRole("dialog", {
    name: "Create this chapter?",
    exact: true,
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(server.state().chapters).toHaveLength(0);
  await expect(review.getByLabel("Proposed chapter title")).toHaveValue(
    "Author’s opening",
  );
  await review
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Create this chapter?", exact: true })
    .getByRole("button", { name: "Confirm creation" })
    .click();
  await expect.poll(() => server.state().chapters.length).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable" }),
  ).toHaveCount(0);
  const accepted = server
    .state()
    .chapterProposals.find((p) => p.status === "accepted")!;
  expect(accepted.paragraphs[0].text).toBe("স্টেশনের ঘড়িটি থেমে ছিল।");
  expect(server.state().chapters[0]).toMatchObject({
    title: "Author’s opening",
    synopsis: "The author’s revised outline",
    approvedId: null,
  });
  expect(server.state().revisions[0].paragraphs[0].text).toBe(
    "লেখকের পরিমার্জিত সূচনা।",
  );
  await page
    .getByRole("button", { name: "Accepted proposals", exact: true })
    .click();
  await page.getByRole("button", { name: "Open created chapter" }).click();
  await expect(page.locator(".paragraph-content").first()).toContainText(
    "লেখকের পরিমার্জিত সূচনা।",
  );
  await page.reload();
  await expect(page.locator(".paragraph-content").first()).toContainText(
    "লেখকের পরিমার্জিত সূচনা।",
  );
  expect(server.state().chapters).toHaveLength(1);
  const other = await browser.newContext();
  try {
    await server.attach(other);
    const second = await other.newPage();
    await second.goto("http://127.0.0.1:5180/");
    await signIn(second);
    await expect(second.locator(".paragraph-content").first()).toContainText(
      "লেখকের পরিমার্জিত সূচনা।",
    );
    await second
      .getByRole("button", { name: /^Proposals/ })
      .filter({ visible: true })
      .first()
      .click();
    await second
      .getByRole("button", { name: "Accepted proposals", exact: true })
      .click();
    await second.getByRole("button", { name: "View chapter proposal" }).click();
    const savedReview = second.getByRole("dialog", {
      name: "New chapter proposal",
      exact: true,
    });
    await expect(savedReview.getByLabel("Proposed chapter title")).toHaveValue(
      "Author’s opening",
    );
    await expect(savedReview).toContainText("লেখকের পরিমার্জিত সূচনা।");
    await expect(
      savedReview.getByRole("button", { name: "Create chapter", exact: true }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("chapter cleanup waits for server save and backup acknowledgment, then syncs removal", async ({
  page,
  context,
}) => {
  let s = fixture();
  s = addChapter(s, s.books[0].id, "Second completed chapter");
  const chapter = s.chapters[0],
    base = head(s, chapter),
    second = s.chapters[1];
  base.paragraphs[0].text = "A completed chapter. ".repeat(1000);
  s.proposals.push({
    id: uid(),
    chapterId: chapter.id,
    baseRevisionId: base.id,
    title: "Reviewed rewrite",
    rationale: "Review complete",
    paragraphs: base.paragraphs,
    status: "rejected",
    createdAt: now(),
  });
  const secondBase = head(s, second);
  s.proposals.push({
    id: uid(),
    chapterId: second.id,
    baseRevisionId: secondBase.id,
    title: "Second review",
    rationale: "Finished",
    paragraphs: secondBase.paragraphs,
    status: "rejected",
    createdAt: now(),
  });
  const fixtureServer = serverFixture(s);
  await fixtureServer.attach(context);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  const headerBackup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  await headerBackup;
  await page
    .getByRole("button", { name: /^History/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Clean up chapter", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Clean up chapter" });
  await expect(
    dialog.getByRole("button", { name: "Confirm cleanup" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "I have made a backup" }).check();
  await dialog.getByRole("button", { name: "Confirm cleanup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
  await expect.poll(() => fixtureServer.state().proposals.length).toBe(1);
  expect(fixtureServer.state().revisions).toEqual(s.revisions);
  expect(fixtureServer.state().chapterCleanups).toHaveLength(1);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Chapter contents" })
    .getByRole("button", { name: /Second completed chapter/ })
    .click();
  await page
    .getByRole("button", { name: /^History/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Clean up chapter", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "I have made a backup" }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Confirm cleanup" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "I have made a backup" }).check();
  await dialog.getByRole("button", { name: "Confirm cleanup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixtureServer.state().chapterCleanups.length).toBe(2);
  expect(fixtureServer.state().proposals).toEqual([]);
  expect(fixtureServer.state().revisions).toEqual(s.revisions);
  expect(downloads).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable" }),
  ).toHaveCount(0);
  await expect(page.locator(".server-sync")).toContainText("Saved to server");
});
