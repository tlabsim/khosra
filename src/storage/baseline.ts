import { compactHistory } from "../domain/compactHistory";
import { validateState, uid, type State } from "../domain/model";
import { equalValue } from "../domain/equal";
import { db } from "./db";
let cached: { state: State; version: string; token: string } | undefined;
/** Recovery baseline is stored as an IndexedDB object, not an escaped JSON copy. */
export async function readBaseline(): Promise<State | undefined> {
  const version = (await db.meta.get("serverVersion"))?.value;
  const token = (await db.meta.get("baselineToken"))?.value;
  if (token && cached?.token === token) return cached.state;
  const row = await db.baselines.get("server");
  if (row) {
    const state = compactHistory(validateState(row.state));
    if (row.token && row.token === token)
      cached = { state, version: row.version, token };
    else await writeBaseline({ state, version: row.version });
    return state;
  }
  const legacy = (await db.meta.get("serverState"))?.value;
  if (!legacy) {
    cached = undefined;
    return;
  }
  const state = compactHistory(validateState(JSON.parse(legacy)));
  // Migrate only after a successful durable write. Keep legacy recovery if it fails.
  if (version !== undefined) await writeBaseline({ state, version });
  return state;
}
export async function writeBaseline(remote: { state: State; version: string }) {
  const storedToken = (await db.meta.get("baselineToken"))?.value;
  if (
    storedToken &&
    cached?.token === storedToken &&
    cached.version === remote.version &&
    equalValue(cached.state, remote.state)
  ) {
    cached = { ...remote, token: storedToken };
    return;
  }
  const token = uid();
  await db.transaction("rw", db.baselines, db.meta, async () => {
    await db.baselines.put({ id: "server", ...remote, token });
    await db.meta.put({ id: "baselineToken", value: token });
    await db.meta.put({ id: "serverVersion", value: remote.version });
    await db.meta.delete("serverState");
  });
  cached = { ...remote, token };
}
