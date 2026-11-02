import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addChapter, emptyState, now, uid } from "../src/domain/model";
import {
  readNavigation,
  rememberedChapter,
  rememberNavigation,
} from "../src/storage/navigation";

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  let state = emptyState();
  for (const title of ["First manuscript", "Second manuscript"]) {
    const id = uid();
    state.books.push({
      id,
      title,
      premise: "",
      language: "en",
      createdAt: now(),
    });
    state = addChapter(state, id, "First chapter");
    state = addChapter(state, id, "Second chapter");
  }
  return state;
}
it("remembers the last manuscript and an independent chapter per manuscript", () => {
  const s = fixture(),
    [a, b] = s.books;
  rememberNavigation(a.id, s.chapters[1].id);
  rememberNavigation(b.id, s.chapters[3].id);
  expect(readNavigation().bookId).toBe(b.id);
  expect(rememberedChapter(s, a.id)?.id).toBe(s.chapters[1].id);
  expect(rememberedChapter(s, b.id)?.id).toBe(s.chapters[3].id);
});
it("ignores deleted, missing and foreign chapter IDs and uses manuscript order", () => {
  const s = fixture(),
    [a, b] = s.books;
  rememberNavigation(a.id, s.chapters[3].id);
  expect(rememberedChapter(s, a.id)?.id).toBe(s.chapters[0].id);
  rememberNavigation(b.id, s.chapters[3].id);
  s.chapters[3].deletedAt = now();
  expect(rememberedChapter(s, b.id)?.id).toBe(s.chapters[2].id);
  s.chapters[2].deletedAt = now();
  expect(rememberedChapter(s, b.id)).toBeUndefined();
});
it("does not replace the saved destination while the workspace is empty", () => {
  rememberNavigation("book", "chapter");
  rememberNavigation("");
  expect(readNavigation()).toEqual({
    bookId: "book",
    chapters: { book: "chapter" },
  });
});
it("recovers from malformed and unavailable browser storage", () => {
  values.set("khosra-workspace-navigation-v1", "{invalid");
  expect(readNavigation()).toEqual({ bookId: "", chapters: {} });
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("full");
    },
  });
  expect(() => rememberNavigation("book", "chapter")).not.toThrow();
  expect(readNavigation()).toEqual({ bookId: "", chapters: {} });
});
it("bounds stale manuscript entries and stores only navigation identifiers", () => {
  for (let i = 0; i < 300; i++) rememberNavigation(`book-${i}`, `chapter-${i}`);
  const stored = readNavigation();
  expect(Object.keys(stored.chapters)).toHaveLength(256);
  expect(stored.bookId).toBe("book-299");
  expect(stored.chapters["book-0"]).toBeUndefined();
});
