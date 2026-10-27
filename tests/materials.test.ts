import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  emptyState,
  uid,
  now,
  addChapter,
  validateState,
} from "../src/domain/model";
import {
  fileBytes,
  materialHeads,
  FILE_LIMIT,
  type Material,
  type MaterialFile,
} from "../src/domain/materials";
import { reconcile } from "../src/sync/reconcile";
import { exportBackup, importBackup } from "../src/storage/db";
function fixture() {
  const s = emptyState();
  const id = uid();
  s.books.push({
    id,
    title: "Mystery",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  const mid = uid();
  const m: Material = {
    id: mid,
    itemId: mid,
    parentId: null,
    bookId: id,
    kind: "idea",
    title: "A possible ending",
    body: "Maybe the witness vanished.",
    chapterIds: [],
    status: "idea",
    fileId: null,
    url: "",
    source: "author",
    createdAt: now(),
  };
  s.materials.push(m);
  return s;
}
function attachment(bookId: string): MaterialFile {
  const raw = "%PDF-1.7\n%%EOF";
  return {
    id: uid(),
    bookId,
    name: "Map.pdf",
    mime: "application/pdf",
    size: raw.length,
    data: btoa(raw),
  };
}
describe("private manuscript materials", () => {
  it("rejects null material collections instead of silently discarding them", () => {
    const s = fixture();
    expect(() => validateState({ ...s, materials: null })).toThrow();
    expect(() => validateState({ ...s, files: null })).toThrow();
  });
  it("adds empty collections to current archives without materials", () => {
    const s = fixture();
    const old = Object.fromEntries(
      Object.entries(s).filter(
        ([key]) => !["materials", "files"].includes(key),
      ),
    );
    expect(validateState(old).materials).toEqual([]);
    expect(validateState(old).files).toEqual([]);
  });
  it("works before a chapter is drafted and permits links only in the same manuscript", () => {
    let s = fixture();
    expect(validateState(s).materials).toHaveLength(1);
    s = addChapter(s, s.books[0].id, "Opening");
    s.materials[0].chapterIds = [s.chapters[0].id];
    expect(() => validateState(s)).not.toThrow();
    s.chapters[0].bookId = uid();
    expect(() => validateState(s)).toThrow();
  });
  it("separates speculative ideas from established context and files", () => {
    const s = fixture();
    s.materials[0].status = "active";
    expect(() => validateState(s)).toThrow();
    s.materials[0].status = "idea";
    s.materials[0].url = "https://example.test";
    expect(() => validateState(s)).toThrow();
  });
  it("preserves immutable metadata versions and concurrent branches on reconciliation", () => {
    const s = fixture(),
      original = s.materials[0];
    const local = structuredClone(s),
      remote = structuredClone(s);
    local.materials.push({
      ...original,
      id: uid(),
      parentId: original.id,
      status: "planned",
    });
    remote.materials.push({
      ...original,
      id: uid(),
      parentId: original.id,
      body: "Another possible ending.",
    });
    const merged = reconcile(local, remote).state;
    expect(merged.materials).toHaveLength(3);
    expect(materialHeads(merged.materials)).toHaveLength(2);
    expect(merged.materials.find((m) => m.id === original.id)).toEqual(
      original,
    );
    remote.materials[0].body = "tampered";
    expect(() => reconcile(local, remote)).toThrow("historical");
  });
  it("rejects missing parents, cross-item chains, root spoofing and cycles", () => {
    for (const mode of ["missing", "foreign", "root", "cycle"]) {
      const s = fixture(),
        m = s.materials[0];
      if (mode === "missing") m.parentId = uid();
      if (mode === "foreign") {
        s.materials.push({ ...m, id: uid(), itemId: uid(), parentId: m.id });
      }
      if (mode === "root") m.itemId = uid();
      if (mode === "cycle") m.parentId = m.id;
      expect(() => validateState(s)).toThrow();
    }
  });
  it("includes private attachment bytes and all versions in a checksum backup", async () => {
    const s = fixture(),
      f = attachment(s.books[0].id);
    s.files.push(f);
    s.materials[0] = {
      ...s.materials[0],
      kind: "artifact",
      status: "active",
      fileId: f.id,
    };
    const backup = await exportBackup(s);
    expect(await importBackup(backup)).toEqual(s);
    expect(fileBytes(f).length).toBe(f.size);
    const envelope = JSON.parse(backup);
    envelope.payload += " ";
    await expect(importBackup(JSON.stringify(envelope))).rejects.toThrow(
      "damaged",
    );
  });
  it("rejects executable uploads, MIME mismatch, malformed base64 and wrong sizes", () => {
    const s = fixture(),
      f = attachment(s.books[0].id);
    for (const bad of [
      { ...f, mime: "image/svg+xml" },
      { ...f, mime: "image/png" },
      { ...f, data: "%%%=" },
      { ...f, size: f.size + 1 },
      { ...f, name: "../Map.pdf" },
      { ...f, size: FILE_LIMIT + 1 },
    ])
      expect(() => validateState({ ...s, files: [bad] })).toThrow();
  });
  it("rejects cross-book file access and unsafe reference URLs", () => {
    const s = fixture(),
      f = attachment(s.books[0].id);
    s.files.push(f);
    const other = uid();
    s.books.push({ ...s.books[0], id: other });
    s.materials[0] = {
      ...s.materials[0],
      bookId: other,
      kind: "artifact",
      status: "active",
      fileId: f.id,
    };
    expect(() => validateState(s)).toThrow("private attachment");
    s.materials[0].fileId = null;
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:password@example.test",
    ]) {
      s.materials[0].url = url;
      expect(() => validateState(s)).toThrow();
    }
  });
  it("retains archived files in capacity calculations and enforces the total limit", () => {
    const s = fixture();
    const raw = "%PDF-" + "a".repeat(FILE_LIMIT - 5);
    const f = {
      ...attachment(s.books[0].id),
      size: raw.length,
      data: btoa(raw),
    };
    s.files = Array.from({ length: 5 }, () => ({ ...f, id: uid() }));
    expect(() => validateState(s)).toThrow("8 MiB");
  });
});
