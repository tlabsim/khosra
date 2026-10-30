import { validateState, type State, uid } from "../domain/model";
import { db, digest } from "../storage/db";
import {
  collections,
  makeDelta,
  parseManifest,
  assemble,
  fingerprint,
  advanceManifest,
  type Delta,
} from "./delta";
import { readSyncCache, writeSyncCache } from "./cache";
import {
  workspaceBody,
  WorkspaceSizeError,
  type WorkspaceTransport,
} from "./workspaceTransport";
export class SyncConflict extends Error {}
export class ServerRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
let csrf = "";
let workspaceTransport: WorkspaceTransport | undefined;
export async function request(path: string, body?: unknown) {
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  const encoded = await (async () => {
    try {
      return ["workspace", "workspace/sync"].includes(path.split("?")[0]) &&
        serialized !== undefined
        ? await workspaceBody(serialized, workspaceTransport)
        : { body: serialized, gzip: false };
    } catch (error) {
      if (error instanceof WorkspaceSizeError)
        throw new ServerRequestError(error.message, 413, "workspace_too_large");
      throw error;
    }
  })();
  const response = await fetch("/api/" + path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(encoded.gzip ? { "Content-Encoding": "gzip" } : {}),
    },
    ...(body !== undefined ? { method: "POST", body: encoded.body } : {}),
  });
  const data = await response.json().catch(() => {
    if (response.status === 413)
      throw new ServerRequestError(
        "The hosting server rejected the upload size. Your changes remain on this device. Export a backup and check PHP/web-server request limits.",
        413,
        "upload_too_large",
      );
    throw new ServerRequestError(
      "The Khosra server returned an unexpected response.",
      response.status,
      "invalid_response",
    );
  });
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ServerRequestError(
      "The Khosra server returned an unexpected response.",
      response.status,
      "invalid_response",
    );
  if (!response.ok) {
    if (response.status === 409)
      throw new SyncConflict(data.error || "Workspace conflict");
    throw new ServerRequestError(
      data.error || "Request failed",
      response.status,
      data.code,
    );
  }
  if (data.csrf) csrf = data.csrf;
  if (path === "session" || path === "login") {
    const capability = data.workspaceTransport;
    workspaceTransport =
      capability &&
      typeof capability.gzip === "boolean" &&
      Number.isSafeInteger(capability.maxDecodedBytes) &&
      capability.maxDecodedBytes > 0
        ? capability
        : undefined;
  }
  if (path === "logout") {
    csrf = "";
    workspaceTransport = undefined;
  }
  return data;
}
export async function login(password: string) {
  await request("login", { password });
}
export async function pull() {
  if (workspaceTransport?.differential === 1) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cached = await readSyncCache();
      const query = cached
        ? `?version=${cached.cache.version}&fingerprint=${cached.cache.fingerprint}`
        : "";
      const info = await request("workspace/sync" + query);
      if (
        !Number.isSafeInteger(info.version) ||
        info.version < 0 ||
        !fingerprint(info.fingerprint)
      )
        throw new ServerRequestError(
          "Invalid differential sync cursor.",
          502,
          "invalid_response",
        );
      if (
        info.mode === "unchanged" &&
        cached &&
        String(info.version) === cached.cache.version &&
        info.fingerprint === cached.cache.fingerprint
      )
        return { state: cached.cache.state, version: cached.cache.version };
      if (info.mode !== "manifest")
        throw new ServerRequestError(
          "Invalid differential sync response.",
          502,
          "invalid_response",
        );
      const manifest = parseManifest(info.manifest),
        ids: Partial<Record<(typeof collections)[number], string[]>> = {};
      for (const key of collections) {
        const previous = new Map(
          cached?.cache.manifest.collections[key].map((r) => [r.id, r.hash]) ??
            [],
        );
        const changed = manifest.collections[key]
          .filter((r) => previous.get(r.id) !== r.hash)
          .map((r) => r.id);
        if (changed.length) ids[key] = changed;
      }
      try {
        const result = Object.keys(ids).length
          ? await request("workspace/sync", {
              action: "pull",
              version: info.version,
              fingerprint: info.fingerprint,
              ids,
            })
          : {
              records: {},
              version: info.version,
              fingerprint: info.fingerprint,
            };
        if (
          result.version !== info.version ||
          result.fingerprint !== info.fingerprint
        )
          throw new ServerRequestError(
            "Differential download changed its source.",
            502,
            "invalid_response",
          );
        for (const key of collections) {
          const requested = ids[key] ?? [],
            received = result.records?.[key] ?? [];
          if (
            !Array.isArray(received) ||
            received.length !== requested.length ||
            received.some((r: { id: string }) => !requested.includes(r.id))
          )
            throw new ServerRequestError(
              "Incomplete differential download.",
              502,
              "invalid_response",
            );
        }
        const state = assemble(manifest, result.records, cached?.cache.state);
        await writeSyncCache(
          {
            version: String(info.version),
            fingerprint: info.fingerprint,
            state,
            manifest,
          },
          cached?.raw,
        );
        return { state, version: String(info.version) };
      } catch (error) {
        if (!(error instanceof SyncConflict) || attempt === 2) throw error;
      }
    }
  }
  const data = await request("workspace");
  return { state: validateState(data.state), version: String(data.version) };
}
export async function push(state: State, expectedVersion?: string) {
  const base =
    expectedVersion ?? (await db.meta.get("serverVersion"))?.value ?? "0";
  const serialized = JSON.stringify(state);
  const targetHash = await digest(serialized);
  const pending = await db.meta.get("pendingPush");
  const cached =
    workspaceTransport?.differential === 1 ? await readSyncCache() : undefined;
  let operationId = uid(),
    endpoint = "workspace",
    body: Record<string, unknown> | undefined;
  if (pending) {
    const parsed = JSON.parse(pending.value);
    if (
      (parsed.targetHash === targetHash || parsed.payload === serialized) &&
      parsed.base === base
    ) {
      operationId = parsed.id;
      // Keep uncertain full-snapshot requests in their original format across upgrades.
      if (parsed.body && parsed.endpoint) {
        body = parsed.body;
        endpoint = parsed.endpoint;
      } else if (parsed.payload === serialized)
        body = { state, baseVersion: Number(base), operationId };
    }
  }
  if (!body && cached && cached.cache.version === base) {
    endpoint = "workspace/sync";
    body = {
      action: "push",
      baseVersion: Number(base),
      baseFingerprint: cached.cache.fingerprint,
      operationId,
      delta: makeDelta(cached.cache.state, state),
    };
  }
  body ??= { state, baseVersion: Number(base), operationId };
  await db.meta.put({
    id: "pendingPush",
    value: JSON.stringify({
      id: operationId,
      targetHash,
      base,
      endpoint,
      body,
    }),
  });
  const data = await request(endpoint, body);
  if (!Number.isSafeInteger(data.version) || data.version !== Number(base) + 1)
    throw new ServerRequestError(
      "Invalid save acknowledgment.",
      502,
      "invalid_response",
    );
  if (
    endpoint === "workspace/sync" &&
    !data.duplicate &&
    (!fingerprint(data.fingerprint) || !data.hashes)
  )
    throw new ServerRequestError(
      "Incomplete differential save acknowledgment.",
      502,
      "invalid_response",
    );
  if (
    endpoint === "workspace/sync" &&
    cached &&
    fingerprint(data.fingerprint) &&
    !data.duplicate
  ) {
    const manifest = advanceManifest(
      cached.cache.manifest,
      body.delta as Delta,
      state,
      data.hashes,
    );
    await writeSyncCache(
      {
        version: String(data.version),
        fingerprint: data.fingerprint,
        state,
        manifest,
      },
      cached.raw,
    );
  }
  await db.meta.put({ id: "serverVersion", value: String(data.version) });
  await db.transaction("rw", db.meta, async () => {
    const current = await db.meta.get("pendingPush");
    if (current && JSON.parse(current.value).id === operationId)
      await db.meta.delete("pendingPush");
  });
  return data;
}
