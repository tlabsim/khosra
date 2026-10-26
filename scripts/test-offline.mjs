import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/api/session" || req.url === "/api/workspace") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          req.url === "/api/session"
            ? { csrf: "offline-test" }
            : {
                version: 0,
                state: {
                  schemaVersion: 1,
                  books: [],
                  chapters: [],
                  revisions: [],
                  flags: [],
                  proposals: [],
                  contexts: [],
                },
              },
        ),
      );
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + "/")) throw Error("bad path");
    const bytes = await readFile(path);
    const type =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".ttf": "font/ttf",
        ".webmanifest": "application/manifest+json",
      }[extname(path)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://khosra.localhost:${server.address().port}`);
  await page.getByRole("button", { name: "Begin a manuscript" }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some((r) => r.active);
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Open cached workspace offline" })
    .click();
  await page.getByRole("button", { name: "Begin a manuscript" }).waitFor();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names)
      for (const r of await (await caches.open(n)).keys()) urls.push(r.url);
    return urls;
  });
  assert(cached.some((u) => u.includes("/fonts/NotoSerifBengali.ttf")));
  assert(cached.some((u) => u.includes("/assets/")));
  assert(!cached.some((u) => u.includes("/api/")));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: authenticated production cache reloads offline through explicit offline access; Bengali fonts and hashed assets cached, API excluded.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
