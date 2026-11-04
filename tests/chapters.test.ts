import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  addChapter,
  commit,
  emptyState,
  head,
  now,
  uid,
  validateState,
} from "../src/domain/model";
import {
  manuscriptChapters,
  chapterNumber,
  restoreChapter,
  trashChapter,
} from "../src/domain/chapters";
import { reconcile } from "../src/sync/reconcile";
import { exportBackup, importBackup } from "../src/storage/db";
function fixture() {
  let s = emptyState();
  const bookId = uid();
  s.books.push({
    id: bookId,
    title: "Book",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  for (const title of ["One", "Two", "Three"]) s = addChapter(s, bookId, title);
  const c = s.chapters[1],
    r = head(s, c);
  s = commit(
    s,
    c.id,
    r.id,
    [{ ...r.paragraphs[0], text: "প্রিয় গল্প।", section: "Scene" }],
    "Author text",
  );
  const latest = s.chapters[1],
    revision = head(s, latest);
  latest.approvedId = revision.id;
  s.flags.push({
    id: uid(),
    number: 1,
    chapterId: c.id,
    revisionId: revision.id,
    paragraphIds: [r.paragraphs[0].id],
    quote: "প্রিয়",
    note: "Keep",
    kind: "reference",
    status: "open",
    createdAt: now(),
  });
  s.proposals.push({
    id: uid(),
    chapterId: c.id,
    baseRevisionId: revision.id,
    title: "Idea",
    rationale: "",
    paragraphs: revision.paragraphs,
    status: "pending",
    createdAt: now(),
  });
  s.contexts.push({
    id: uid(),
    chapterId: c.id,
    revisionId: revision.id,
    summary: "Summary",
    facts: [],
    createdAt: now(),
  });
  return validateState(s);
}
it("moves chapters to Trash without changing any linked prose or decisions, and restores original identity and order", () => {
  const s = fixture(),
    c = s.chapters[1];
  const deleted = validateState(trashChapter(s, c.id));
  expect(manuscriptChapters(deleted, c.bookId).map((x) => x.title)).toEqual([
    "One",
    "Three",
  ]);
  for (const key of ["revisions", "flags", "proposals", "contexts"] as const)
    expect(deleted[key]).toEqual(s[key]);
  expect(deleted.chapters[1]).toMatchObject({
    ...c,
    deletedAt: expect.any(String),
  });
  const restored = validateState(restoreChapter(deleted, c.id));
  expect(manuscriptChapters(restored, c.bookId)).toEqual(s.chapters);
  expect(restored).toEqual(s);
});
it("keeps Trash through archive round trips and does not reuse readable chapter codes", async () => {
  const s = fixture(),
    c = s.chapters[2];
  const deleted = trashChapter(s, c.id);
  const backup = await importBackup(await exportBackup(deleted));
  expect(backup).toEqual(deleted);
  const added = addChapter(backup, c.bookId, "Four");
  expect(added.chapters.at(-1)!.code).toBe(4);
  const restored = validateState(restoreChapter(added, c.id));
  expect(manuscriptChapters(restored, c.bookId).map((x) => x.title)).toEqual([
    "One",
    "Two",
    "Three",
    "Four",
  ]);
});
it("restores the only chapter and safely rejects repeated or unknown deletion/restoration", () => {
  const s = fixture(),
    bookId = s.books[0].id;
  const deleted = s.chapters.reduce((state, c) => trashChapter(state, c.id), s);
  expect(manuscriptChapters(deleted, bookId)).toEqual([]);
  expect(
    manuscriptChapters(restoreChapter(deleted, s.chapters[1].id), bookId)[0].id,
  ).toBe(s.chapters[1].id);
  expect(() => trashChapter(deleted, s.chapters[0].id)).toThrow();
  expect(() => restoreChapter(s, s.chapters[0].id)).toThrow();
  expect(() => trashChapter(s, uid())).toThrow();
  expect(() =>
    validateState({
      ...s,
      chapters: [
        { ...s.chapters[0], deletedAt: "yesterday" },
        ...s.chapters.slice(1),
      ],
    }),
  ).toThrow();
});
it("requires an explicit sync choice for deletion versus active edits and retains both revision histories", () => {
  const s = fixture(),
    c = s.chapters[1],
    r = head(s, c);
  const deleted = trashChapter(s, c.id);
  const edited = commit(
    s,
    c.id,
    r.id,
    [{ ...r.paragraphs[0], text: "Other device edit" }],
    "Other device",
  );
  const result = reconcile(deleted, edited);
  expect(result.conflicts.find((x) => x.id === c.id)?.local).toContain(
    "In Trash",
  );
  const merged = reconcile(
    deleted,
    edited,
    Object.fromEntries(result.conflicts.map((x) => [x.id, "local" as const])),
  );
  expect(merged.conflicts).toHaveLength(0);
  expect(
    merged.state.chapters.find((x) => x.id === c.id)!.deletedAt,
  ).toBeTruthy();
  expect(merged.state.revisions).toContainEqual(edited.revisions.at(-1));
  const restore = reconcile(restoreChapter(deleted, c.id), deleted);
  expect(restore.conflicts.some((x) => x.id === c.id)).toBe(true);
});

it("inserts chapters at the beginning or after an active chapter without changing references or history", () => {
  const source = fixture(),
    bookId = source.books[0].id;
  const history = structuredClone(source.revisions);
  const first = addChapter(source, bookId, "New opening", {
    afterChapterId: null,
  });
  const inserted = first.chapters.at(-1)!;
  expect(manuscriptChapters(first, bookId).map((c) => c.title)).toEqual([
    "New opening",
    "One",
    "Two",
    "Three",
  ]);
  expect(inserted.code).toBe(4);
  const next = addChapter(first, bookId, "Middle", {
    afterChapterId: source.chapters[1].id,
  });
  expect(manuscriptChapters(next, bookId).map((c) => c.title)).toEqual([
    "New opening",
    "One",
    "Two",
    "Middle",
    "Three",
  ]);
  expect(next.revisions.slice(0, history.length)).toEqual(history);
  for (const c of source.chapters)
    expect(next.chapters.find((x) => x.id === c.id)!.code).toBe(c.code);
  expect(() =>
    addChapter(source, bookId, "Stale", { afterChapterId: uid() }),
  ).toThrow(/position/);
  const trashed = trashChapter(source, source.chapters[1].id);
  expect(() =>
    addChapter(trashed, bookId, "Stale", {
      afterChapterId: source.chapters[1].id,
    }),
  ).toThrow(/position/);
  expect(() => addChapter(source, uid(), "Missing book")).toThrow(/Manuscript/);
  validateState(next);
});

it("creates and restores a unique preface at chapter zero while regular reading numbers start at one", async () => {
  let s = fixture();
  const bookId = s.books[0].id;
  s = addChapter(s, bookId, "ভূমিকা", { preface: true });
  const preface = s.chapters.at(-1)!;
  expect(preface.code).toBe(0);
  s = addChapter(s, bookId, "First regular", { afterChapterId: null });
  const ordered = manuscriptChapters(s, bookId);
  expect(ordered.map((c) => c.title)).toEqual([
    "ভূমিকা",
    "First regular",
    "One",
    "Two",
    "Three",
  ]);
  expect(ordered.map((c) => chapterNumber(ordered, c))).toEqual([
    0, 1, 2, 3, 4,
  ]);
  expect(() => addChapter(s, bookId, "Duplicate", { preface: true })).toThrow(
    /already has a preface/,
  );
  const trashed = trashChapter(s, preface.id);
  expect(chapterNumber(manuscriptChapters(trashed, bookId), ordered[1])).toBe(
    1,
  );
  expect(() =>
    addChapter(trashed, bookId, "Duplicate", { preface: true }),
  ).toThrow(/Restore/);
  const restored = restoreChapter(trashed, preface.id);
  expect(manuscriptChapters(restored, bookId)[0].id).toBe(preface.id);
  expect(await importBackup(await exportBackup(restored))).toEqual(
    validateState(restored),
  );
  const negative = structuredClone(restored);
  negative.chapters[0].code = -1;
  expect(() => validateState(negative)).toThrow();
});
