import { collections, type Collection, type Manifest } from "./delta";
export type RecordIds = Partial<Record<Collection, string[]>>;
/** Keep server download processing within one manuscript and a small byte budget. */
export function manuscriptBatches(
  manifest: Manifest,
  ids: RecordIds,
): RecordIds[] {
  const groups = new Map<
    string,
    { key: Collection; id: string; bytes: number }[]
  >();
  for (const key of collections) {
    const wanted = new Set(ids[key] || []);
    for (const row of manifest.collections[key])
      if (wanted.has(row.id)) {
        const group = row.bookId || "legacy";
        const list = groups.get(group) || [];
        list.push({ key, id: row.id, bytes: row.bytes ?? 65536 });
        groups.set(group, list);
      }
  }
  const batches: RecordIds[] = [];
  for (const rows of groups.values()) {
    let batch: RecordIds = {},
      bytes = 0,
      count = 0;
    for (const row of rows) {
      if (count && (bytes + row.bytes > 4 * 1024 * 1024 || count >= 50)) {
        batches.push(batch);
        batch = {};
        bytes = 0;
        count = 0;
      }
      (batch[row.key] ??= []).push(row.id);
      bytes += row.bytes;
      count++;
    }
    if (count) batches.push(batch);
  }
  return batches;
}
