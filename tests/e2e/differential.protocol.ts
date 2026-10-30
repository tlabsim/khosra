import { expect, test } from "@playwright/test";
test("real browser and PHP exchange paragraph deltas against a 27 MB workspace", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:18084";
  const login = await fetch(origin + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ password: "isolated-browser-sync-password" }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const saves: {
    bytes: number;
    gzip?: string;
    body: Record<string, unknown>;
  }[] = [];
  let fullTransfers = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname + new URL(req.url()).search;
    if (path === "/api/workspace") fullTransfers++;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
    };
    for (const field of ["x-csrf-token", "content-encoding"])
      if (req.headers()[field]) headers[field] = req.headers()[field];
    const data = req.postDataBuffer();
    if (data && !headers["content-encoding"]) {
      const body = JSON.parse(data.toString("utf8"));
      if (body.action === "push")
        saves.push({
          bytes: data.length,
          gzip: headers["content-encoding"],
          body,
        });
    }
    const response = await fetch(origin + path, {
      method: req.method(),
      headers,
      ...(data ? { body: new Uint8Array(data) } : {}),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await page.route("**/__sync_test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Sync protocol test</title>",
    }),
  );
  await page.goto("/__sync_test");
  const result = await page.evaluate(async () => {
    const clientPath = "/src/sync/client.ts",
      modelPath = "/src/domain/model.ts";
    const client = await import(/* @vite-ignore */ clientPath),
      model = await import(/* @vite-ignore */ modelPath);
    await client.request("session");
    const before = await client.pull(),
      chapter = before.state.chapters[0],
      source = model.head(before.state, chapter);
    const text = `নতুন সূত্র খুঁজে পেল। ${before.version}`;
    const next = model.commit(
      before.state,
      chapter.id,
      chapter.headId,
      source.paragraphs.map((p: { text: string }, i: number) =>
        i ? p : { ...p, text },
      ),
      "One paragraph",
    );
    const saved = await client.push(next, before.version);
    const after = await client.pull(),
      current = model.head(after.state, after.state.chapters[0]);
    return {
      initialBytes: new Blob([JSON.stringify(before.state)]).size,
      version: saved.version,
      baseVersion: before.version,
      expectedHistory: before.state.revisions.length + 1,
      expectedFirst: text,
      afterVersion: after.version,
      paragraphs: current.paragraphs.length,
      first: current.paragraphs[0].text,
      lastUnchanged:
        JSON.stringify(current.paragraphs.at(-1)) ===
        JSON.stringify(source.paragraphs.at(-1)),
      history: after.state.revisions.length,
    };
  });
  expect(result.initialBytes).toBeGreaterThan(25 * 1024 * 1024);
  expect(result.version).toBe(Number(result.baseVersion) + 1);
  expect(result.afterVersion).toBe(String(result.version));
  expect(result.first).toBe(result.expectedFirst);
  expect(result.lastUnchanged).toBe(true);
  expect(result.paragraphs).toBe(180);
  expect(result.history).toBe(result.expectedHistory);
  expect(saves).toHaveLength(1);
  expect(saves[0].bytes).toBeLessThan(2000);
  expect(saves[0].gzip).toBeUndefined();
  expect(fullTransfers).toBe(0);
});
