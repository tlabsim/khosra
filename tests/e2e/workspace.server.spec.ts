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
  await page.goto("/");
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
