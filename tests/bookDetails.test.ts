import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  addChapter,
  emptyState,
  now,
  uid,
  validateState,
} from "../src/domain/model";
import { readCover, updateBookDetails } from "../src/domain/bookDetails";
import {
  applyMaterialDeletions,
  type MaterialFile,
} from "../src/domain/materials";
import { exportBackup, importBackup } from "../src/storage/db";
import { makeDelta } from "../src/sync/delta";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWioAAAAASUVORK5CYII=";
function fixture() {
  let s = emptyState();
  s.books.push({
    id: uid(),
    title: "Original",
    premise: "A mystery",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, s.books[0].id, "Opening");
  return s;
}
function image(bookId: string): MaterialFile {
  return {
    id: uid(),
    bookId,
    name: "Cover.png",
    mime: "image/png",
    size: atob(png).length,
    data: png,
  };
}
describe("manuscript details", () => {
  it("renames only the selected manuscript without changing identities, chapters or history", () => {
    const s = fixture(),
      book = s.books[0];
    const other = { ...book, id: uid(), title: "Other" };
    s.books.push(other);
    const result = updateBookDetails(s, book, {
      ...book,
      title: "  নিখোঁজ জাদুকর  ",
      premise: "Revised premise",
      language: "en",
    });
    expect(result.books[0]).toMatchObject({
      id: book.id,
      title: "নিখোঁজ জাদুকর",
      createdAt: book.createdAt,
    });
    expect(result.books[1]).toBe(other);
    expect(result.chapters).toBe(s.chapters);
    expect(result.revisions).toBe(s.revisions);
    expect(() => validateState(result)).not.toThrow();
    expect(() =>
      updateBookDetails(s, book, { ...book, title: "  " }),
    ).toThrow();
    expect(() =>
      updateBookDetails(s, book, { ...book, title: "x".repeat(301) }),
    ).toThrow();
  });
  it("rejects stale metadata but allows unrelated manuscript work", () => {
    const s = fixture(),
      b = s.books[0];
    const updated = updateBookDetails(s, b, { ...b, title: "Remote change" });
    expect(() =>
      updateBookDetails(updated, b, { ...b, title: "Stale change" }),
    ).toThrow(/changed/);
    const unrelated = {
      ...s,
      chapters: s.chapters.map((c) => ({ ...c, title: "New chapter name" })),
    };
    expect(
      updateBookDetails(unrelated, b, { ...b, title: "New title" }).chapters,
    ).toBe(unrelated.chapters);
  });
  it("keeps cover attachments through validation, differential metadata updates and backups", async () => {
    const s = fixture(),
      b = s.books[0],
      file = image(b.id);
    const result = validateState(
      updateBookDetails(s, b, { ...b, coverFileId: file.id }, file),
    );
    expect(result.books[0].coverFileId).toBe(file.id);
    const delta = makeDelta(s, result);
    expect(delta.collections.books?.upserts[0].set.coverFileId).toBe(file.id);
    expect(delta.collections.files?.upserts).toHaveLength(1);
    const restored = await importBackup(await exportBackup(result));
    expect(restored.books[0].coverFileId).toBe(file.id);
    expect(restored.files[0]).toEqual(file);
    const removed = updateBookDetails(result, result.books[0], {
      ...b,
      coverFileId: null,
    });
    expect(removed.books[0].coverFileId).toBeNull();
    expect(removed.files).toEqual(result.files);
    expect(() => validateState(removed)).not.toThrow();
    expect(() => validateState({ ...result, files: [] })).toThrow(/cover/);
    expect(() =>
      updateBookDetails(
        s,
        b,
        { ...b, coverFileId: file.id },
        { ...file, bookId: uid() },
      ),
    ).toThrow(/cover/);
    const pdf = {
      ...file,
      mime: "application/pdf" as const,
      data: btoa("%PDF-1"),
      size: 6,
    };
    expect(() =>
      updateBookDetails(s, b, { ...b, coverFileId: file.id }, pdf),
    ).toThrow(/cover/);
  });
  it("retains files that are still used as covers when an artifact is deleted", () => {
    const s = fixture(),
      file = image(s.books[0].id),
      id = uid();
    s.files.push(file);
    s.books[0].coverFileId = file.id;
    s.materials.push({
      id,
      itemId: id,
      parentId: null,
      bookId: s.books[0].id,
      kind: "artifact",
      title: "Artwork",
      body: "",
      chapterIds: [],
      status: "active",
      fileId: file.id,
      url: "",
      source: "author",
      createdAt: now(),
    });
    s.materialDeletions.push({
      id: uid(),
      itemId: id,
      bookId: s.books[0].id,
      createdAt: now(),
    });
    const result = applyMaterialDeletions(s);
    expect(result.materials).toHaveLength(0);
    expect(result.files).toEqual([file]);
    expect(() => validateState(result)).not.toThrow();
  });
  it("accepts real image uploads and rejects unsupported, forged or oversized files", async () => {
    const id = uid(),
      bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    expect(
      (
        await readCover(
          new File([bytes], "cover.png", { type: "image/png" }),
          id,
        )
      ).data,
    ).toBe(png);
    await expect(
      readCover(
        new File(["<svg/>"], "cover.svg", { type: "image/svg+xml" }),
        id,
      ),
    ).rejects.toThrow(/PNG/);
    await expect(
      readCover(new File(["invalid"], "cover.png", { type: "image/png" }), id),
    ).rejects.toThrow(/content/);
    await expect(
      readCover(
        new File([new Uint8Array(2097153)], "cover.png", { type: "image/png" }),
        id,
      ),
    ).rejects.toThrow(/2 MiB/);
  });
});
