import { describe, expect, it } from "vitest";
import { manuscriptBatches } from "../src/sync/batches";
import { collections, type Manifest } from "../src/sync/delta";
import { uid } from "../src/domain/model";
const manifest = (): Manifest => ({
  schemaVersion: 1,
  collections: Object.fromEntries(
    collections.map((key) => [key, []]),
  ) as unknown as Manifest["collections"],
});
describe("manuscript sync batches", () => {
  it("isolates manuscripts, bounds bytes and preserves requested identities", () => {
    const m = manifest(),
      a = uid(),
      b = uid();
    for (let i = 0; i < 6; i++)
      m.collections.revisions.push({
        id: uid(),
        hash: "a".repeat(64),
        bookId: i % 2 ? a : b,
        bytes: 3 * 1024 * 1024,
      });
    const ids = m.collections.revisions.map((r) => r.id);
    const batches = manuscriptBatches(m, { revisions: ids });
    expect(batches).toHaveLength(6);
    expect(batches.flatMap((batch) => batch.revisions || []).sort()).toEqual(
      [...ids].sort(),
    );
    expect(batches.every((batch) => batch.revisions?.length === 1)).toBe(true);
  });
  it("limits small records, omits unrequested rows and tolerates an oversized single record", () => {
    const m = manifest(),
      book = uid();
    for (let i = 0; i < 103; i++)
      m.collections.flags.push({
        id: uid(),
        hash: "a".repeat(64),
        bookId: book,
        bytes: 100,
      });
    m.collections.files.push({
      id: uid(),
      hash: "b".repeat(64),
      bookId: book,
      bytes: 8 * 1024 * 1024,
    });
    const ids = m.collections.flags.slice(0, 101).map((r) => r.id);
    const batches = manuscriptBatches(m, {
      flags: ids,
      files: [m.collections.files[0].id],
    });
    expect(batches).toHaveLength(4);
    expect(batches.map((batch) => batch.flags?.length || 0)).toEqual([
      50, 50, 1, 0,
    ]);
    expect(batches[3].files).toEqual([m.collections.files[0].id]);
    expect(manuscriptBatches(m, {})).toEqual([]);
  });
});
