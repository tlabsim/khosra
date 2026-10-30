import { validateState, type State, uid } from "../domain/model";
import { db } from "../storage/db";
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
      return path === "workspace" && serialized !== undefined
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
  const data = await request("workspace");
  return { state: validateState(data.state), version: String(data.version) };
}
export async function push(state: State, expectedVersion?: string) {
  const base =
    expectedVersion ?? (await db.meta.get("serverVersion"))?.value ?? "0";
  const serialized = JSON.stringify(state);
  const pending = await db.meta.get("pendingPush");
  let operationId = uid();
  if (pending) {
    const parsed = JSON.parse(pending.value);
    if (parsed.payload === serialized && parsed.base === base)
      operationId = parsed.id;
  }
  await db.meta.put({
    id: "pendingPush",
    value: JSON.stringify({ id: operationId, payload: serialized, base }),
  });
  const data = await request("workspace", {
    state,
    baseVersion: Number(base),
    operationId,
  });
  await db.meta.put({ id: "serverVersion", value: String(data.version) });
  await db.meta.delete("pendingPush");
  return data;
}
