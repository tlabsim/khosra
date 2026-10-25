import Dexie, { type Table } from "dexie";
import { emptyState, validateState, type State } from "../domain/model";
class KhosraDB extends Dexie {
  workspace!: Table<{ id: string; state: State; version?: number }, string>;
  meta!: Table<{ id: string; value: string }, string>;
  constructor() {
    super("khosra-studio-v2");
    this.version(1).stores({ workspace: "id", meta: "id" });
  }
}
export const db = new KhosraDB();
let localVersion = 0;
export async function readState() {
  const row = await db.workspace.get("owner");
  localVersion = row?.version || 0;
  return row ? validateState(row.state) : emptyState();
}
export async function saveState(state: State) {
  validateState(state);
  await db.transaction("rw", db.workspace, async () => {
    const stored = await db.workspace.get("owner");
    if ((stored?.version || 0) !== localVersion)
      throw Error(
        "Another tab changed this workspace. Export your unsaved work, then reload and reconcile.",
      );
    const version = localVersion + 1;
    await db.workspace.put({ id: "owner", state, version });
    localVersion = version;
  });
}
export async function digest(text: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function exportBackup(state: State) {
  const payload = JSON.stringify(validateState(state));
  return JSON.stringify(
    {
      format: "khosra-archive",
      version: 1,
      exportedAt: new Date().toISOString(),
      sha256: await digest(payload),
      payload,
    },
    null,
    2,
  );
}
export async function importBackup(text: string) {
  const envelope = JSON.parse(text);
  if (
    envelope.format !== "khosra-archive" ||
    envelope.version !== 1 ||
    typeof envelope.payload !== "string" ||
    (await digest(envelope.payload)) !== envelope.sha256
  )
    throw Error("Archive is damaged or unsupported. Nothing was imported.");
  return validateState(JSON.parse(envelope.payload));
}
export function download(
  text: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
