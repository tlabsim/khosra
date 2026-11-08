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
  cancelParagraphSession,
  checkParagraphSession,
  startParagraphSession,
} from "../src/domain/paragraphSession";
import { joinParagraph, splitParagraph } from "../src/domain/paragraphEditing";

function fixture() {
  let s = emptyState();
  const bookId = uid();
  s.books.push({
    id: bookId,
    title: "Session fixture",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, bookId, "Opening");
  const c = s.chapters[0],
    r = head(s, c);
  s = commit(
    s,
    c.id,
    r.id,
    [
      { ...r.paragraphs[0], text: "মূল লেখা।" },
      { id: uid(), label: 2, section: "", text: "পরের কথা।" },
    ],
    "Original",
  );
  return s;
}
it("cancels autosaved text through a new revision while retaining every draft", () => {
  let s = fixture();
  const original = head(s, s.chapters[0]);
  const session = startParagraphSession(s, s.chapters[0].id);
  s = commit(
    s,
    session.chapterId,
    session.headId,
    original.paragraphs.map((p, i) =>
      i ? p : { ...p, text: "Abandoned draft" },
    ),
    "Author session",
  );
  session.headId = s.chapters[0].headId;
  const before = structuredClone(s);
  const result = cancelParagraphSession(s, session);
  expect(head(result, result.chapters[0]).paragraphs).toEqual(
    original.paragraphs,
  );
  expect(head(result, result.chapters[0])).toMatchObject({
    parentId: session.headId,
    source: "restore",
  });
  expect(result.revisions.slice(0, -1)).toEqual(s.revisions);
  expect(s).toEqual(before);
  expect(validateState(result)).toEqual(result);
});
it("reverses splits and joins, retaining original UUIDs and subsection headings", () => {
  for (const split of [true, false]) {
    let s = fixture();
    const original = head(s, s.chapters[0]);
    const session = startParagraphSession(s, s.chapters[0].id);
    const edit = split
      ? splitParagraph(
          original.paragraphs,
          original.paragraphs[0].id,
          "Changed text",
          4,
          4,
          3,
        )
      : joinParagraph(
          original.paragraphs,
          original.paragraphs[1].id,
          "Changed ending",
          -1,
        )!;
    s = commit(
      s,
      session.chapterId,
      session.headId,
      edit.paragraphs,
      "Structural edit",
    );
    session.headId = s.chapters[0].headId;
    const result = cancelParagraphSession(s, session);
    expect(head(result, result.chapters[0]).paragraphs).toEqual(
      original.paragraphs,
    );
    expect(result.revisions).toHaveLength(s.revisions.length + 1);
  }
});
it("rejects unexpected chapter updates and deleted chapters without altering them", () => {
  let s = fixture();
  const session = startParagraphSession(s, s.chapters[0].id);
  s = commit(
    s,
    session.chapterId,
    session.headId,
    head(s, s.chapters[0]).paragraphs,
    "Outside edit",
  );
  const before = structuredClone(s);
  expect(() => cancelParagraphSession(s, session)).toThrow(
    "outside the editing session",
  );
  expect(() => checkParagraphSession(s, session)).toThrow(
    "outside the editing session",
  );
  expect(s).toEqual(before);
  s.chapters[0].deletedAt = now();
  expect(() => startParagraphSession(s, session.chapterId)).toThrow(
    "no longer available",
  );
});
it("preserves other chapters and metadata, and skips a redundant restore", () => {
  let s = fixture();
  const session = startParagraphSession(s, s.chapters[0].id);
  expect(cancelParagraphSession(s, session)).toBe(s);
  const original = head(s, s.chapters[0]);
  s = commit(
    s,
    session.chapterId,
    session.headId,
    original.paragraphs.map((p) => ({ ...p, text: p.text + " Changed." })),
    "Draft",
  );
  session.headId = s.chapters[0].headId;
  s = addChapter(s, s.books[0].id, "Another chapter");
  s.chapters[0].title = "New title";
  const other = structuredClone(s.chapters[1]);
  const result = cancelParagraphSession(s, session);
  expect(result.chapters[0].title).toBe("New title");
  expect(result.chapters[1]).toEqual(other);
  expect(head(result, result.chapters[0]).paragraphs).toEqual(
    original.paragraphs,
  );
});
it("removes a newly inserted paragraph without deleting its history", () => {
  let s = fixture();
  const session = startParagraphSession(s, s.chapters[0].id);
  const original = head(s, s.chapters[0]);
  const inserted = { id: uid(), label: 3, text: "New paragraph", section: "" };
  s = commit(
    s,
    session.chapterId,
    session.headId,
    [...original.paragraphs, inserted],
    "Inserted",
  );
  session.headId = s.chapters[0].headId;
  const restored = cancelParagraphSession(s, session);
  expect(head(restored, restored.chapters[0]).paragraphs).toEqual(
    original.paragraphs,
  );
  expect(
    restored.revisions.find((r) => r.id === session.headId)!.paragraphs,
  ).toContainEqual(inserted);
});
