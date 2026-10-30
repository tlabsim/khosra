import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import {
  workspaceBody,
  WorkspaceSizeError,
} from "../src/sync/workspaceTransport";
import { request, push } from "../src/sync/client";
import { db } from "../src/storage/db";
import { emptyState } from "../src/domain/model";

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.meta.clear();
});
const transport = { gzip: true, maxDecodedBytes: 64 * 1024 * 1024 };

it("losslessly compresses a Bengali request larger than the old 20 MiB ceiling", async () => {
  const json = JSON.stringify({ text: "রহস্যের সূত্র। ".repeat(700000) });
  expect(new Blob([json]).size).toBeGreaterThan(20 * 1024 * 1024);
  const encoded = await workspaceBody(json, transport);
  expect(encoded.gzip).toBe(true);
  const body = encoded.body as Blob;
  expect(body.size).toBeLessThan(1024 * 1024);
  const decoded = await new Response(
    body.stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
  expect(decoded).toBe(json);
});

it("keeps small requests and older servers on ordinary JSON", async () => {
  expect(await workspaceBody("{}", transport)).toEqual({
    body: "{}",
    gzip: false,
  });
  const json = JSON.stringify({ text: "x".repeat(2 * 1024 * 1024) });
  expect(await workspaceBody(json)).toEqual({ body: json, gzip: false });
});

it("falls back to plain JSON on browsers without native compression", async () => {
  vi.stubGlobal("CompressionStream", undefined);
  const json = JSON.stringify({ text: "x".repeat(21 * 1024 * 1024) });
  expect(await workspaceBody(json, transport)).toEqual({
    body: json,
    gzip: false,
  });
});

it("counts UTF-8 bytes when enforcing the advertised decoded limit", async () => {
  await expect(
    workspaceBody("বাংলা", { gzip: true, maxDecodedBytes: 5 }),
  ).rejects.toBeInstanceOf(WorkspaceSizeError);
});

it("negotiates compression after sign-in and sends CSRF with the exact JSON content", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ csrf: "test", workspaceTransport: transport }),
      ),
    )
    .mockResolvedValueOnce(new Response('{"version":8}'));
  vi.stubGlobal("fetch", fetcher);
  await request("session");
  const body = { operationId: "same-operation", text: "বাংলা".repeat(1500000) };
  await request("workspace", body);
  const options = fetcher.mock.calls[1][1];
  expect(options.headers["Content-Encoding"]).toBe("gzip");
  expect(options.headers["X-CSRF-Token"]).toBe("test");
  const decoded = await new Response(
    options.body.stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
  expect(decoded).toBe(JSON.stringify(body));
});

it("identifies a hosting-level HTML 413 and preserves pending retry identity and version", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<h1>Request Entity Too Large</h1>", { status: 413 }),
      ),
  );
  await db.meta.put({ id: "serverVersion", value: "7" });
  await expect(push(emptyState(), "7")).rejects.toMatchObject({
    code: "upload_too_large",
    status: 413,
  });
  const pending = await db.meta.get("pendingPush");
  expect(pending).toBeDefined();
  expect((await db.meta.get("serverVersion"))?.value).toBe("7");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"version":8}')),
  );
  await push(emptyState(), "7");
  const retry = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
  expect(retry.operationId).toBe(JSON.parse(pending!.value).id);
  expect(await db.meta.get("pendingPush")).toBeUndefined();
  expect((await db.meta.get("serverVersion"))?.value).toBe("8");
});

it("compresses only when the actual UTF-8 payload is strictly larger than 20 MiB", async () => {
  const exact = "x".repeat(20 * 1024 * 1024);
  expect((await workspaceBody(exact, transport)).gzip).toBe(false);
  expect((await workspaceBody(exact + "x", transport)).gzip).toBe(true);
  expect(
    (await workspaceBody("x".repeat(2 * 1024 * 1024), transport)).gzip,
  ).toBe(false);
});
