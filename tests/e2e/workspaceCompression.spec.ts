import { expect, test } from "@playwright/test";
import { gunzipSync } from "node:zlib";

test("native browser gzip sends a large Bengali workspace request with CSRF", async ({
  page,
}) => {
  test.setTimeout(120000);
  let decodedBytes = 0;
  let wireBytes = 0;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        csrf: "compression-test",
        workspaceTransport: { gzip: true, maxDecodedBytes: 64 * 1024 * 1024 },
      },
    }),
  );
  await page.route("**/api/workspace", async (route) => {
    const request = route.request();
    expect(request.headers()["content-encoding"]).toBe("gzip");
    expect(request.headers()["x-csrf-token"]).toBe("compression-test");
    const bytes = request.postDataBuffer()!;
    wireBytes = bytes.length;
    const decoded = gunzipSync(bytes);
    decodedBytes = decoded.length;
    const body = JSON.parse(decoded.toString("utf8"));
    expect(body.operationId).toBe("unchanged-operation");
    expect(body.text).toBe("রহস্যের সূত্র। ".repeat(700000));
    await route.fulfill({ json: { version: 8 } });
  });
  // Exercise the real fetch transport without booting the unrelated manuscript UI.
  await page.route("**/__compression_test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Transport test</title>",
    }),
  );
  await page.goto("/__compression_test");
  const version = await page.evaluate(async () => {
    const path = "/src/sync/client.ts";
    const { request } = await import(/* @vite-ignore */ path);
    await request("session");
    return (
      await request("workspace", {
        text: "রহস্যের সূত্র। ".repeat(700000),
        baseVersion: 7,
        operationId: "unchanged-operation",
      })
    ).version;
  });
  expect(version).toBe(8);
  expect(decodedBytes).toBeGreaterThan(20 * 1024 * 1024);
  expect(wireBytes).toBeLessThan(1024 * 1024);
});
