import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  emptyState,
  uid,
  now,
  addChapter,
  commit,
  head,
  acceptProposal,
  validateState,
  type State,
} from "../src/domain/model";
import {
  collections,
  makeDelta,
  assemble,
  parseManifest,
  type Manifest,
  type Delta,
  type Collection,
} from "../src/sync/delta";
import { request, pull, push, SyncConflict } from "../src/sync/client";
import { readSyncCache, writeSyncCache } from "../src/sync/cache";
import { db } from "../src/storage/db";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Row = { id: string } & Record<string, unknown>;
function manifest(state: State): Manifest {
  return {
    schemaVersion: 1,
    collections: Object.fromEntries(
      collections.map((key) => [
        key,
        state[key].map((r) => ({ id: r.id, hash: hash(r) })),
      ]),
    ) as Manifest["collections"],
  };
}
function fixture(count = 8) {
  let s = emptyState();
  const book = uid();
  s.books.push({
    id: book,
    title: "Mystery",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, book, "Opening");
  const c = s.chapters[0],
    initial = head(s, c);
  s = commit(
    s,
    c.id,
    c.headId,
    Array.from({ length: count }, (_, i) => ({
      id: i ? uid() : initial.paragraphs[0].id,
      label: i + 1,
      section: "",
      text: `সূত্র ${i + 1}`,
    })),
    "Source",
  );
  return validateState(s);
}
function edit(s: State, text = "নতুন সূত্র") {
  return commit(
    s,
    s.chapters[0].id,
    s.chapters[0].headId,
    head(s, s.chapters[0]).paragraphs.map((p, i) => (i ? p : { ...p, text })),
    "Edit",
  );
}
function wireRecords(state: State): Record<string, Row[]> {
  const changes = makeDelta(emptyState(), state);
  return Object.fromEntries(
    collections.map((key) => [
      key,
      (changes.collections[key]?.upserts ?? []).map((p) => ({
        id: p.id,
        ...p.set,
      })),
    ]),
  );
}
function apply(old: State, delta: Delta): State {
  const records = wireRecords(old),
    nextIds = new Map<Collection, string[]>();
  for (const key of collections) {
    const change = delta.collections[key];
    if (!change) {
      nextIds.set(
        key,
        old[key].map((r) => r.id),
      );
      continue;
    }
    // Existing baseline records are full snapshots; only incoming rows may use the wire codec.
    const lookup = new Map(
      (old[key] as unknown as Row[]).map((r) => [r.id, structuredClone(r)]),
    );
    change.remove.forEach((id) => lookup.delete(id));
    for (const p of change.upserts) {
      const row = { ...(lookup.get(p.id) ?? { id: p.id }), ...p.set };
      p.unset.forEach((field) => delete row[field]);
      lookup.set(p.id, row);
    }
    records[key] = [...lookup.values()];
    nextIds.set(key, change.order ?? [...lookup.keys()]);
  }
  const desired = manifest(old);
  for (const key of collections)
    desired.collections[key] = nextIds
      .get(key)!
      .map((id) => ({ id, hash: "0".repeat(64) }));
  return assemble(desired, records);
}
async function server(initial = fixture()) {
  let state = initial,
    version = 1,
    loseResponse = false,
    racePull = false,
    incompleteAck = false;
  const operations = new Map<string, { payload: string; version: number }>(),
    sent: {
      endpoint: string;
      body?: Record<string, unknown>;
      gzip: boolean;
      bytes: number;
    }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = new URL(path, "https://test.example"),
        gzip =
          (init?.headers as Record<string, string>)?.["Content-Encoding"] ===
          "gzip";
      let text = typeof init?.body === "string" ? init.body : "";
      if (init?.body instanceof Blob)
        text = await new Response(
          init.body.stream().pipeThrough(new DecompressionStream("gzip")),
        ).text();
      const body = text ? JSON.parse(text) : undefined;
      sent.push({
        endpoint: url.pathname,
        body,
        gzip,
        bytes: new Blob([text]).size,
      });
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (url.pathname === "/api/session")
        return reply({
          csrf: "test",
          workspaceTransport: {
            gzip: true,
            maxDecodedBytes: 64 * 1024 * 1024,
            differential: 1,
          },
        });
      if (url.pathname !== "/api/workspace/sync")
        throw Error("Unexpected full workspace transfer");
      if (!body) {
        if (
          url.searchParams.get("version") === String(version) &&
          url.searchParams.get("fingerprint") === hash(state)
        )
          return reply({
            mode: "unchanged",
            version,
            fingerprint: hash(state),
          });
        return reply({
          mode: "manifest",
          version,
          fingerprint: hash(state),
          manifest: manifest(state),
        });
      }
      if (body.action === "pull") {
        if (racePull) {
          racePull = false;
          state = edit(state, "Concurrent server edit");
          version++;
          return reply({ error: "Changed during pull" }, 409);
        }
        const all = wireRecords(state),
          records: Record<string, unknown> = {};
        for (const [key, ids] of Object.entries(
          body.ids as Record<string, string[]>,
        ))
          records[key] = all[key].filter((r) => ids.includes(r.id));
        return reply({
          mode: "records",
          version,
          fingerprint: hash(state),
          records,
        });
      }
      const known = operations.get(body.operationId);
      if (known)
        return known.payload === text
          ? reply({ version: known.version, duplicate: true })
          : reply({ error: "Operation reused" }, 409);
      if (body.baseVersion !== version || body.baseFingerprint !== hash(state))
        return reply({ error: "Workspace changed" }, 409);
      state = apply(state, body.delta);
      version++;
      operations.set(body.operationId, { payload: text, version });
      const hashes: Record<string, Record<string, string>> = {};
      for (const key of collections)
        if (body.delta.collections[key]) {
          hashes[key] = {};
          for (const p of body.delta.collections[key].upserts)
            hashes[key][p.id] = hash(
              (state[key] as unknown as Row[]).find((r) => r.id === p.id),
            );
        }
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Connection lost after commit");
      }
      if (incompleteAck) {
        incompleteAck = false;
        return reply({ version });
      }
      return reply({ version, fingerprint: hash(state), hashes });
    }),
  );
  await request("session");
  return {
    sent,
    state: () => state,
    version: () => version,
    lose: () => {
      loseResponse = true;
    },
    race: () => {
      racePull = true;
    },
    badAck: () => {
      incompleteAck = true;
    },
    mutate: () => {
      state = edit(state, "Later remote work");
      version++;
    },
    reset: (s: State) => {
      state = s;
    },
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await db.meta.clear();
  await db.workspace.clear();
});

it("uploads only a changed paragraph/new revision and uses unchanged polling after acknowledgment", async () => {
  const source = fixture(2000),
    remote = await server(source);
  expect((await pull()).state).toEqual(source);
  const next = edit(source);
  await push(next, "1");
  const save = remote.sent.find((r) => r.body?.action === "push")!;
  expect(save.bytes).toBeLessThan(2000);
  expect(save.gzip).toBe(false);
  expect(save.body).not.toHaveProperty("state");
  expect(remote.state()).toEqual(next);
  const calls = remote.sent.length;
  expect((await pull()).state).toEqual(next);
  expect(remote.sent.length - calls).toBe(1);
  expect(remote.sent.at(-1)!.body).toBeUndefined();
});

it("downloads only changed records and resolves insert/delete/reorder paragraph snapshots", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  remote.mutate();
  const current = await pull();
  expect(current.state).toEqual(remote.state());
  const download = remote.sent
    .filter((r) => r.body?.action === "pull")
    .at(-1)!.body!;
  expect(Object.keys(download.ids as object).sort()).toEqual([
    "chapters",
    "revisions",
  ]);
  const c = current.state.chapters[0],
    old = head(current.state, c).paragraphs;
  const next = commit(
    current.state,
    c.id,
    c.headId,
    [
      old[3],
      { id: uid(), label: 9, text: "Added", section: "New" },
      old[0],
      ...old.slice(4),
    ],
    "Structural",
  );
  await push(next, current.version);
  expect(remote.state()).toEqual(next);
});

it("retains the exact request on a lost response, even after another server write", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  const next = edit(source);
  remote.lose();
  await expect(push(next, "1")).rejects.toThrow("Connection lost");
  const pending = (await db.meta.get("pendingPush"))!.value;
  remote.mutate();
  await push(next, "1");
  const attempts = remote.sent.filter((r) => r.body?.action === "push");
  expect(attempts[0].body).toEqual(attempts[1].body);
  expect(JSON.parse(pending).body).toEqual(attempts[0].body);
  expect(remote.version()).toBe(3);
  expect(await db.meta.get("pendingPush")).toBeUndefined();
  expect((await pull()).state).toEqual(remote.state());
});

it("rejects stale updates and retries a racing differential download", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  remote.mutate();
  await expect(push(edit(source), "1")).rejects.toBeInstanceOf(SyncConflict);
  expect(await db.meta.get("pendingPush")).toBeDefined();
  remote.race();
  expect((await pull()).state).toEqual(remote.state());
});

it("detects a same-version server reset and repairs only a corrupt derived cache", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  const recovery = edit(source, "Unsynced device draft");
  await db.workspace.put({ id: "owner", state: recovery });
  remote.reset(fixture());
  expect((await pull()).state).toEqual(remote.state());
  const cache = await db.meta.get("syncCache");
  const corrupt = JSON.parse(cache!.value);
  corrupt.state.books[0].title = "Corrupt";
  await db.meta.put({ id: "syncCache", value: JSON.stringify(corrupt) });
  expect((await pull()).state).toEqual(remote.state());
  expect((await db.workspace.get("owner"))!.state).toEqual(recovery);
});

it("does not acknowledge incomplete save responses and cannot regress another tab's cache", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  const before = (await readSyncCache())!;
  remote.badAck();
  await expect(push(edit(source), "1")).rejects.toThrow("Incomplete");
  expect(await db.meta.get("pendingPush")).toBeDefined();
  const latest = await pull(),
    after = (await readSyncCache())!;
  await writeSyncCache(before.cache, before.raw);
  expect((await readSyncCache())!.raw).toBe(after.raw);
  expect(latest.state).toEqual(remote.state());
});

it("round trips pending and completed proposal review snapshots without repeating untouched prose", () => {
  const source = fixture(100),
    base = head(source, source.chapters[0]);
  source.proposals.push({
    id: uid(),
    chapterId: base.chapterId,
    baseRevisionId: base.id,
    title: "Suggestion",
    rationale: "",
    status: "pending",
    createdAt: now(),
    paragraphs: base.paragraphs.map((p, i) =>
      i ? p : { ...p, text: "Proposed" },
    ),
  });
  const decoded = assemble(manifest(source), wireRecords(source));
  expect(decoded).toEqual(source);
  const accepted = acceptProposal(source, source.proposals[0]);
  expect(assemble(manifest(accepted), wireRecords(accepted))).toEqual(accepted);
  const target = structuredClone(source);
  target.proposals[0].status = "rejected";
  const change = makeDelta(source, target).collections.proposals!.upserts[0];
  expect(change.set).toEqual({ status: "rejected" });
  expect(change.unset).toEqual([]);
});

it("rejects malformed manifests, unknown or duplicate identities, missing sources and cycles", () => {
  const source = fixture(),
    m = manifest(source),
    all = wireRecords(source);
  const duplicate = structuredClone(m);
  duplicate.collections.books.push(duplicate.collections.books[0]);
  expect(() => parseManifest(duplicate)).toThrow();
  expect(() => assemble(m, { ...all, books: [] })).toThrow("Incomplete");
  const broken = structuredClone(all);
  const r = broken.revisions[1];
  (r.paragraphs as Record<string, unknown>).baseRevisionId = uid();
  expect(() => assemble(m, broken)).toThrow("source");
  const cyclic = structuredClone(all);
  cyclic.revisions[1].parentId = cyclic.revisions[1].id;
  expect(() => assemble(m, cyclic)).toThrow("Cyclic");
});

it("preserves the format and operation ID of an uncertain legacy full upload during upgrade", async () => {
  const source = fixture(),
    next = edit(source),
    operationId = uid();
  await writeSyncCache({
    state: source,
    version: "1",
    fingerprint: hash(source),
    manifest: manifest(source),
  });
  await db.meta.put({
    id: "pendingPush",
    value: JSON.stringify({
      id: operationId,
      payload: JSON.stringify(next),
      base: "1",
    }),
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          csrf: "test",
          workspaceTransport: {
            gzip: true,
            maxDecodedBytes: 64 * 1024 * 1024,
            differential: 1,
          },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response('{"version":2}'));
  vi.stubGlobal("fetch", fetcher);
  await request("session");
  await push(next, "1");
  expect(fetcher.mock.calls[1][0]).toBe("/api/workspace");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    state: next,
    baseVersion: 1,
    operationId,
  });
  expect(await db.meta.get("pendingPush")).toBeUndefined();
});

it("reconstructs a deep history supplied in reverse dependency order", () => {
  const state = fixture(1),
    original = head(state, state.chapters[0]);
  let previous = original.id;
  const chain = Array.from({ length: 1000 }, () => {
    const row = { ...original, id: uid(), parentId: previous };
    previous = row.id;
    return row;
  });
  state.revisions.push(...chain.reverse());
  expect(assemble(manifest(state), wireRecords(state))).toEqual(
    validateState(state),
  );
});

it("a derived-cache quota failure cannot block a committed save or evict author data", async () => {
  const source = fixture(),
    remote = await server(source);
  await pull();
  const next = edit(source);
  await db.workspace.put({ id: "owner", state: next });
  const original = db.meta.put.bind(db.meta);
  vi.spyOn(db.meta, "put").mockImplementation((row, key) => {
    if (row.id === "syncCache")
      return Promise.reject(
        Object.assign(new Error("Cache quota"), { name: "QuotaExceededError" }),
      ) as ReturnType<typeof db.meta.put>;
    return original(row, key);
  });
  expect((await push(next, "1")).version).toBe(2);
  expect(remote.state()).toEqual(next);
  expect(await db.meta.get("pendingPush")).toBeUndefined();
  expect(await db.meta.get("syncCache")).toBeUndefined();
  expect((await db.workspace.get("owner"))!.state).toEqual(next);
  expect((await pull()).state).toEqual(next);
});
