import { test, expect, type Page } from "@playwright/test";
import { checkPasswordReveal } from "./password";
const chapterId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const paragraphId = "44444444-4444-4444-8444-444444444444";
const invitationId = "55555555-5555-4555-8555-555555555555";
const token = "a".repeat(43);
const chapter = {
  id: chapterId,
  title: "অতিথির অধ্যায়",
  number: 1,
  revisionId,
  paragraphs: [
    {
      id: paragraphId,
      label: 1,
      section: "",
      text: "বাংলা পাঠ। Only the shared manuscript belongs here.",
    },
  ],
};
async function guestFixture(page: Page, expiresIn = 3600) {
  let active = true;
  const comments: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(url.pathname.startsWith("/api/guest/")).toBe(true);
    if (!active) {
      await route.fulfill({
        status: 410,
        json: {
          error: "This reading invitation is unavailable or has expired.",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/exchange")) {
      expect(req.postDataJSON().token).toBe(token);
      await route.fulfill({ json: { ok: true, invitationId } });
    } else if (url.pathname.endsWith("/session")) {
      await route.fulfill({
        json: {
          invitationId,
          title: "A private invitation",
          language: "bn",
          recipient: "Trusted reader",
          csrf: "guest-csrf",
          expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
          chapters: [
            { id: chapterId, title: chapter.title, number: 1, revisionId },
          ],
        },
      });
    } else if (url.pathname.endsWith("/chapter"))
      await route.fulfill({ json: { chapter } });
    else if (url.pathname.endsWith("/comments") && req.method() === "POST") {
      expect(req.headers()["x-guest-csrf"]).toBe("guest-csrf");
      const body = req.postDataJSON();
      comments.push({
        id: body.operationId,
        chapter_id: chapterId,
        revision_id: revisionId,
        paragraph_id: body.paragraphId,
        chapter_title: chapter.title,
        paragraph_label: body.paragraphId ? 1 : null,
        quote: body.paragraphId ? chapter.paragraphs[0].text : "",
        comment_text: body.text,
        created_at: Math.floor(Date.now() / 1000),
      });
      await route.fulfill({ status: 201, json: { ok: true } });
    } else await route.fulfill({ json: { comments } });
  });
  return {
    revoke: () => {
      active = false;
    },
    comments,
  };
}
test("guest reader stays separate, accepts anchored feedback and clears revoked access", async ({
  page,
}, info) => {
  const fixture = await guestFixture(page);
  await page.goto("/guest#token=" + token);
  await expect(page.locator(".book-reader")).toBeVisible();
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.locator(".reading-text")).toContainText(
    chapter.paragraphs[0].text,
  );
  await expect(
    page.getByRole("button", { name: "Library", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings & backups" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(
    page.getByRole("switch", { name: "Show paragraph IDs" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Text selectable" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close reading preferences" }).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-guest-reader.png`,
  });
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  await page
    .getByRole("combobox", { name: "About", exact: true })
    .selectOption(paragraphId);
  await page
    .getByLabel("Your thoughts")
    .fill("ভালো লেগেছে। <script>window.injected=true</script>");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.locator(".reader-comments")).toContainText("ভালো লেগেছে।");
  expect(fixture.comments[0].revision_id).toBe(revisionId);
  expect(await page.evaluate(() => Object.hasOwn(window, "injected"))).toBe(
    false,
  );
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-guest-feedback.png`,
  });
  await page.getByRole("button", { name: "Close sharing dialog" }).click();
  fixture.revoke();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("heading", { name: "Reading unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".book-reader")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    chapter.paragraphs[0].text,
  );
});
test("guest content clears at expiry and remains unavailable offline", async ({
  page,
}) => {
  await guestFixture(page, 2);
  await page.goto("/guest#token=" + token);
  await expect(page.locator(".book-reader")).toBeVisible();
  await expect(
    page.getByText("This reading invitation has expired.", { exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".book-reader")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".book-reader")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByText(
      "Reading requires an internet connection. Reconnect and try again.",
    ),
  ).toBeVisible();
  await expect(page.locator(".book-reader")).toHaveCount(0);
});
test("share dialog creates, copies, reviews and revokes a named invitation", async ({
  page,
}, info) => {
  let connected = false;
  let created: Record<string, unknown> | null = null;
  const invitations: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname === "/api/session")
      await route.fulfill({
        status: connected ? 200 : 401,
        json: connected
          ? { csrf: "owner-csrf" }
          : { error: "Owner session required." },
      });
    else if (url.pathname === "/api/login") {
      connected = true;
      await route.fulfill({ json: { csrf: "owner-csrf" } });
    } else if (url.pathname === "/api/shares" && req.method() === "POST") {
      expect(req.headers()["x-csrf-token"]).toBe("owner-csrf");
      created = req.postDataJSON();
      invitations.push({
        id: invitationId,
        recipient: created!.recipient,
        bookId: created!.bookId,
        title: created!.title,
        chapterCount: 1,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: created!.expiresAt,
        revokedAt: null,
      });
      await route.fulfill({
        status: 201,
        json: {
          id: invitationId,
          url: "http://127.0.0.1:5173/guest#token=" + token,
        },
      });
    } else if (url.pathname.endsWith("/comments"))
      await route.fulfill({
        json: {
          comments: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              chapter_id: chapterId,
              revision_id: revisionId,
              paragraph_id: paragraphId,
              chapter_title: "First chapter",
              paragraph_label: 1,
              quote: "A source passage",
              comment_text: "Thoughtful feedback.",
              created_at: Math.floor(Date.now() / 1000),
            },
          ],
        },
      });
    else if (url.pathname.endsWith("/revoke")) {
      invitations[0].revokedAt = Math.floor(Date.now() / 1000);
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: { invitations } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("A manuscript for friends");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Chapter actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Share for reading" }).click();
  const dialog = page.getByRole("dialog", { name: "Share for reading" });
  await expect(
    page.getByRole("heading", { name: "Sign in to manage reading links" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-share-signin.png`,
  });
  await checkPasswordReveal(page, "Your Khosra password", "fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.locator(".sharing-manuscript")).toContainText(
    "A manuscript for friends",
  );
  await dialog.locator(".sharing-chapters summary").click();
  await dialog
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Create reading link" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Create reading link" }),
  ).toBeEnabled();
  await dialog.locator(".sharing-chapters summary").click();
  await page.getByLabel("Reader name").fill("Amina");
  await page.getByLabel("Expires in").selectOption("14");
  await page.getByRole("button", { name: "Create reading link" }).click();
  await expect(page.getByLabel("Reading link", { exact: true })).toHaveValue(
    "http://127.0.0.1:5173/guest#token=" + token,
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(created!.recipient).toBe("Amina");
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  await expect(dialog).toContainText("Thoughtful feedback.");
  await page.screenshot({
    path: `test-results/${info.project.name}-share-dialog.png`,
  });
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(dialog).toContainText("Revoked");
  await page.getByRole("button", { name: "Close sharing dialog" }).click();
  await expect(
    page.getByRole("heading", { name: "This chapter is empty" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings & backups" }).click();
  await expect(page.locator(".settings-connection-state")).toHaveText(
    "Connected",
  );
  await expect(
    page.getByRole("button", { name: "Upload local workspace" }),
  ).toBeEnabled();
});

test("sharing setup and connection failures never masquerade as a password prompt", async ({
  page,
}, info) => {
  let mode: "setup" | "html" | "network" | "signin" = "setup";
  await page.route("**/api/**", async (route) => {
    if (mode === "setup")
      await route.fulfill({
        status: 503,
        json: {
          error:
            "Private server is not configured. Local workspace remains available.",
          code: "server_not_configured",
        },
      });
    else if (mode === "html")
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Missing API</title>",
      });
    else if (mode === "network") await route.abort("connectionrefused");
    else
      await route.fulfill({
        status: 401,
        json: { error: "Owner session required." },
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Begin a manuscript" }).click();
  await page.getByLabel("Working title").fill("A local manuscript");
  await page.getByRole("button", { name: "Create manuscript" }).click();
  await page
    .getByRole("button", { name: "Chapter actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Share for reading" }).click();
  const dialog = page.getByRole("dialog", { name: "Share for reading" });
  await expect(
    page.getByRole("heading", { name: "Sharing isn’t set up yet" }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog).toContainText("You can keep writing on this device.");
  await page.screenshot({
    path: `test-results/${info.project.name}-share-setup.png`,
  });
  mode = "html";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sharing is temporarily unavailable" }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  mode = "network";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sharing is temporarily unavailable" }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-share-unavailable.png`,
  });
  mode = "signin";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to manage reading links" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Your Khosra password", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Guests only need their reading link.");
  await page
    .getByRole("button", { name: "Server settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings & connections" }),
  ).toBeVisible();
});
