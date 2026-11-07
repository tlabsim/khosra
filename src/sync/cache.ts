import { compactHistory } from "../domain/compactHistory";
import { validateState, uid, type State } from "../domain/model";
import { db, digest } from "../storage/db";
import {
  collections,
  fingerprint,
  parseManifest,
  type Manifest,
} from "./delta";

export type SyncCache = {
  version: string;
  fingerprint: string;
  manifest: Manifest;
  state: State;
  localHash: string;
};
export type Cached = { cache: SyncCache; raw: string };
let memoized: Cached | undefined;
export async function readSyncCache(): Promise<Cached | undefined> {
  const row = await db.meta.get("syncCache");
  if (!row) {
    memoized = undefined;
    return;
  }
  if (memoized?.raw === row.value) return memoized;
  try {
    const value = JSON.parse(row.value);
    if (
      !/^\d+$/.test(value.version) ||
      !Number.isSafeInteger(Number(value.version)) ||
      !fingerprint(value.fingerprint)
    )
      throw Error("Invalid sync cursor.");
    const stored =
      value.state === undefined ? await db.cacheStates.get("sync") : undefined;
    if (value.state === undefined && (!stored || stored.token !== value.token))
      throw Error("Incomplete sync cache.");
    const state = compactHistory(validateState(value.state ?? stored!.state)),
      manifest = parseManifest(value.manifest);
    if (value.localHash !== (await digest(JSON.stringify(state))))
      throw Error("Damaged sync cache.");
    for (const key of collections)
      if (
        JSON.stringify(state[key].map((r) => r.id)) !==
        JSON.stringify(manifest.collections[key].map((r) => r.id))
      )
        throw Error("Incomplete sync cache.");
    if (value.state !== undefined) {
      const migrated = await writeSyncCache(
        {
          version: value.version,
          fingerprint: value.fingerprint,
          state,
          manifest,
        },
        row.value,
      );
      return migrated ? memoized : undefined;
    }
    memoized = { raw: row.value, cache: { ...value, state, manifest } };
    return memoized;
  } catch {
    memoized = undefined;
    // Discard only the derived cache, never the author workspace or recovery baseline.
    await db.transaction("rw", db.meta, db.cacheStates, async () => {
      if ((await db.meta.get("syncCache"))?.value === row.value) {
        await db.meta.delete("syncCache");
        await db.cacheStates.delete("sync");
      }
    });
    return;
  }
}
export async function writeSyncCache(
  value: Omit<SyncCache, "localHash">,
  expected?: string,
) {
  const state = compactHistory(validateState(value.state));
  const localHash = await digest(JSON.stringify(state));
  const token = uid();
  const raw = JSON.stringify({
    version: value.version,
    fingerprint: value.fingerprint,
    manifest: value.manifest,
    localHash,
    token,
  });
  try {
    let written = false;
    await db.transaction("rw", db.meta, db.cacheStates, async () => {
      if ((await db.meta.get("syncCache"))?.value === expected) {
        await db.cacheStates.put({ id: "sync", state, token });
        await db.meta.put({ id: "syncCache", value: raw });
        memoized = { raw, cache: { ...value, state, localHash } };
        written = true;
      }
    });
    return written;
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "QuotaExceededError")
      throw error;
    memoized = undefined;
    // A derived cache must not prevent acknowledging an already committed save.
    // Recover by bootstrapping again; never evict author data or its sync baseline.
    await db.transaction("rw", db.meta, db.cacheStates, async () => {
      if ((await db.meta.get("syncCache"))?.value === expected) {
        await db.meta.delete("syncCache");
        await db.cacheStates.delete("sync");
      }
    });
    return false;
  }
}
