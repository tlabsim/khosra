import { afterEach, expect, it, vi } from "vitest";
import { request, ServerRequestError, SyncConflict } from "../src/sync/client";
afterEach(() => vi.unstubAllGlobals());
it("preserves HTTP status and machine-readable setup errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Not configured",
            code: "server_not_configured",
          }),
          { status: 503 },
        ),
      ),
  );
  await expect(request("session")).rejects.toMatchObject({
    status: 503,
    code: "server_not_configured",
    message: "Not configured",
  });
});
it("distinguishes sign-in requirements from a missing API returning HTML", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Owner session required." }), {
          status: 401,
        }),
      ),
  );
  await expect(request("session")).rejects.toBeInstanceOf(ServerRequestError);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<!doctype html><title>Fallback</title>", { status: 200 }),
      ),
  );
  await expect(request("session")).rejects.toMatchObject({
    code: "invalid_response",
  });
});
it("keeps existing workspace conflict handling intact", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Chapter changed" }), {
          status: 409,
        }),
      ),
  );
  await expect(request("workspace", {})).rejects.toBeInstanceOf(SyncConflict);
});
