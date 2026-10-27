import { describe, it, expect } from "vitest";
import { emptyState, now, uid, validateState } from "../src/domain/model";
import { deleteMaterial } from "../src/domain/materialDeletion";
import { reconcile } from "../src/sync/reconcile";
import { type Material } from "../src/domain/materials";
function fixture() {
  const s = emptyState(),
    bookId = uid(),
    id = uid();
  s.books.push({
    id: bookId,
    title: "Mystery",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  const idea: Material = {
    id,
    itemId: id,
    parentId: null,
    bookId,
    kind: "idea",
    title: "Alternative ending",
    body: "The witness returns",
    chapterIds: [],
    status: "idea",
    url: "",
    fileId: null,
    createdAt: now(),
    source: "author",
  };
  s.materials.push(idea);
  return { s, idea };
}
describe("author material deletion", () => {
  it("removes every version and concurrent branch without changing other ideas", () => {
    const { s, idea } = fixture();
    const a = { ...idea, id: uid(), parentId: idea.id },
      b = { ...idea, id: uid(), parentId: idea.id };
    const other = { ...idea, id: uid(), itemId: uid() };
    other.itemId = other.id;
    s.materials.push(a, b, other);
    const result = deleteMaterial(s, a.id, [a.id, b.id]);
    expect(result.materials).toEqual([other]);
    expect(result.materialDeletions[0].itemId).toBe(idea.itemId);
    expect(s.materials).toHaveLength(4);
    expect(result.revisions).toEqual(s.revisions);
  });
  it("collects historical attachments but retains files shared with another artifact", () => {
    const { s, idea } = fixture();
    const raw = "%PDF-1.7\n%%EOF";
    const f = {
      id: uid(),
      bookId: idea.bookId,
      name: "map.pdf",
      mime: "application/pdf" as const,
      size: raw.length,
      data: btoa(raw),
    };
    const f2 = { ...f, id: uid(), name: "old-map.pdf" };
    s.files.push(f, f2);
    const root = {
      ...idea,
      kind: "artifact" as const,
      status: "active" as const,
      fileId: f2.id,
    };
    const head = { ...root, id: uid(), parentId: root.id, fileId: f.id };
    const shared = { ...root, id: uid(), itemId: uid(), fileId: f.id };
    shared.itemId = shared.id;
    s.materials = [root, head, shared];
    const result = deleteMaterial(s, head.id, [head.id]);
    expect(result.files).toEqual([f]);
    const empty = deleteMaterial(result, shared.id, [shared.id]);
    expect(empty.files).toEqual([]);
    expect(empty.materials).toEqual([]);
  });
  it("prevents older archives and concurrent edits from resurrecting deleted material or its file", () => {
    const { s, idea } = fixture();
    const raw = "%PDF-1.7\n%%EOF";
    s.files = [
      {
        id: uid(),
        bookId: idea.bookId,
        name: "map.pdf",
        mime: "application/pdf",
        size: raw.length,
        data: btoa(raw),
      },
    ];
    s.materials[0] = {
      ...idea,
      kind: "artifact",
      status: "active",
      fileId: s.files[0].id,
    };
    const deleted = deleteMaterial(s, idea.id, [idea.id]);
    const edited = structuredClone(s);
    edited.materials.push({
      ...edited.materials[0],
      id: uid(),
      parentId: idea.id,
      body: "Concurrent note",
    });
    for (const [a, b] of [
      [deleted, edited],
      [edited, deleted],
    ]) {
      const merged = reconcile(a, b).state;
      expect(merged.materials).toEqual([]);
      expect(merged.files).toEqual([]);
      expect(merged.materialDeletions).toHaveLength(1);
    }
    expect(() =>
      validateState({ ...s, materialDeletions: deleted.materialDeletions }),
    ).toThrow(/Deleted materials/);
  });
  it("requires a new review if the item changes after confirmation opens", () => {
    const { s, idea } = fixture();
    s.materials.push({ ...idea, id: uid(), parentId: idea.id });
    expect(() => deleteMaterial(s, idea.id, [idea.id])).toThrow(
      /changed while/,
    );
    expect(() => deleteMaterial(s, uid(), [])).toThrow(/no longer exists/);
  });
  it("retains independent simultaneous deletions and defaults older workspace schemas", () => {
    const { s, idea } = fixture();
    const a = deleteMaterial(s, idea.id, [idea.id]),
      b = deleteMaterial(s, idea.id, [idea.id]);
    expect(reconcile(a, b).state.materialDeletions).toHaveLength(2);
    const legacy = { ...s } as Record<string, unknown>;
    delete legacy.materialDeletions;
    expect(validateState(legacy).materialDeletions).toEqual([]);
  });
});
