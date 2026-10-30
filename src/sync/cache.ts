import { validateState, type State } from "../domain/model";
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
export async function readSyncCache(): Promise<Cached | undefined> {
  const row = await db.meta.get("syncCache");
  if (!row) return;
  try {
    const value = JSON.parse(row.value);
    if (
      !/^\d+$/.test(value.version) ||
      !Number.isSafeInteger(Number(value.version)) ||
      !fingerprint(value.fingerprint)
    )
      throw Error("Invalid sync cursor.");
    const state = validateState(value.state),
      manifest = parseManifest(value.manifest);
    if (value.localHash !== (await digest(JSON.stringify(state))))
      throw Error("Damaged sync cache.");
    for (const key of collections)
      if (
        JSON.stringify(state[key].map((r) => r.id)) !==
        JSON.stringify(manifest.collections[key].map((r) => r.id))
      )
        throw Error("Incomplete sync cache.");
    return { raw: row.value, cache: { ...value, state, manifest } };
  } catch {
    // Discard only the derived cache, never the author workspace or recovery baseline.
    await db.transaction("rw", db.meta, async () => {
      if ((await db.meta.get("syncCache"))?.value === row.value)
        await db.meta.delete("syncCache");
    });
  }
}
export async function writeSyncCache(
  value: Omit<SyncCache, "localHash">,
  expected?: string,
) {
  const state = validateState(value.state);
  const localHash = await digest(JSON.stringify(state));
  const raw = JSON.stringify({ ...value, state, localHash });
  try {
    await db.transaction("rw", db.meta, async () => {
      if ((await db.meta.get("syncCache"))?.value === expected)
        await db.meta.put({ id: "syncCache", value: raw });
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "QuotaExceededError")
      throw error;
    // A derived cache must not prevent acknowledging an already committed save.
    // Recover by bootstrapping again; never evict author data or its sync baseline.
    await db.transaction("rw", db.meta, async () => {
      if ((await db.meta.get("syncCache"))?.value === expected)
        await db.meta.delete("syncCache");
    });
  }
}
