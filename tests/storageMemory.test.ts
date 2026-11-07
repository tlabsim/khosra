import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, expect, it, vi } from "vitest";
import {
  db,
  readState,
  saveState,
  assertDeviceVersion,
} from "../src/storage/db";
import { readBaseline, writeBaseline } from "../src/storage/baseline";
import { emptyState, uid, now } from "../src/domain/model";
beforeEach(async () => {
  await db.delete();
  await db.open();
  await readState();
});
const fixture = () => ({
  ...emptyState(),
  books: [
    {
      id: uid(),
      title: "Recovery",
      premise: "",
      language: "bn" as const,
      createdAt: now(),
    },
  ],
});
it("checks local-save CAS with index keys rather than cloning the workspace", async () => {
  const state = fixture();
  await saveState(state);
  const get = vi.spyOn(db.workspace, "get");
  await assertDeviceVersion();
  await saveState(state);
  expect(get).not.toHaveBeenCalled();
  get.mockRestore();
  const row = (await db.workspace.get("owner"))!;
  await db.workspace.put({ ...row, version: row.version! + 1 });
  await expect(assertDeviceVersion()).rejects.toThrow(/Another tab/);
  await expect(saveState(state)).rejects.toThrow(/Another tab/);
});
it("upgrades legacy IndexedDB rows and migrates recovery baseline without losing author state", async () => {
  await db.delete();
  const old = new Dexie(db.name);
  old.version(1).stores({ workspace: "id", meta: "id" });
  await old.open();
  const state = fixture();
  await old.table("workspace").put({ id: "owner", state });
  await old.table("meta").bulkPut([
    { id: "serverState", value: JSON.stringify(state) },
    { id: "serverVersion", value: "7" },
  ]);
  old.close();
  await db.open();
  expect(await readState()).toEqual(state);
  await saveState(state);
  expect(await readBaseline()).toEqual(state);
  expect(await db.meta.get("serverState")).toBeUndefined();
  expect((await db.baselines.get("server"))!.state).toEqual(state);
});
it("keeps the last acknowledged baseline during a push and notices another tab's baseline", async () => {
  const first = fixture();
  await writeBaseline({ state: first, version: "1" });
  await db.meta.put({ id: "serverVersion", value: "2" });
  expect(await readBaseline()).toBe(first);
  const next = fixture();
  await db.baselines.put({
    id: "server",
    state: next,
    version: "2",
    token: "another-tab",
  });
  await db.meta.put({ id: "baselineToken", value: "another-tab" });
  expect(await readBaseline()).toEqual(next);
});
it("retains legacy recovery when baseline migration cannot be persisted", async () => {
  const state = fixture();
  await db.meta.bulkPut([
    { id: "serverState", value: JSON.stringify(state) },
    { id: "serverVersion", value: "9" },
  ]);
  const put = vi
    .spyOn(db.baselines, "put")
    .mockRejectedValueOnce(Error("Quota"));
  await expect(readBaseline()).rejects.toThrow("Quota");
  put.mockRestore();
  expect(JSON.parse((await db.meta.get("serverState"))!.value)).toEqual(state);
});
