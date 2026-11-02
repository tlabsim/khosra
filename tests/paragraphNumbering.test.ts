import { expect, it } from "vitest";
import {
  acceptProposal,
  addChapter,
  commit,
  emptyState,
  head,
  now,
  orderCurrentParagraphNumbers,
  reference,
  uid,
  validateState,
  type Paragraph,
  type Proposal,
} from "../src/domain/model";
import { changedParagraphIds } from "../src/domain/proposalComparison";
import { acceptChapterProposal } from "../src/domain/chapterProposals";

function fixture() {
  let s = emptyState();
  const bookId = uid();
  s.books.push({
    id: bookId,
    title: "Numbering",
    language: "bn",
    premise: "",
    createdAt: now(),
  });
  s = addChapter(s, bookId, "Opening");
  const c = s.chapters[0];
  const initial = head(s, c);
  s = commit(
    s,
    c.id,
    initial.id,
    [
      initial.paragraphs[0],
      ...Array.from({ length: 3 }, () => ({
        id: uid(),
        label: 100,
        text: "",
        section: "",
      })),
    ].map((p, i) => ({ ...p, label: i + 1, text: `Text ${i + 1}` })),
    "Initial",
  );
  return { s, c: s.chapters[0], base: head(s, s.chapters[0]) };
}
const fresh = (): Paragraph => ({
  id: uid(),
  label: 100,
  text: "Inserted",
  section: "",
});

it("orders prepend, middle insert, deletion and move while retaining UUIDs, text and source snapshots", () => {
  for (const transform of [
    (rows: Paragraph[]) => [fresh(), ...rows],
    (rows: Paragraph[]) => [rows[0], fresh(), ...rows.slice(1)],
    (rows: Paragraph[]) => rows.slice(1),
    (rows: Paragraph[]) => [...rows].reverse(),
  ]) {
    const { s, c, base } = fixture();
    s.chapters[0].approvedId = base.id;
    const rows = transform(base.paragraphs);
    const next = commit(s, c.id, base.id, rows, "Structure");
    const current = head(next, next.chapters[0]);
    expect(current.paragraphs.map((p) => p.label)).toEqual(
      rows.map((_, i) => i + 1),
    );
    expect(
      current.paragraphs.map(({ id, text, section }) => ({
        id,
        text,
        section,
      })),
    ).toEqual(rows.map(({ id, text, section }) => ({ id, text, section })));
    expect(current.edition).toBeGreaterThan(base.edition);
    expect(next.revisions.find((r) => r.id === base.id)).toEqual(base);
    expect(next.chapters[0].approvedId).toBe(base.id);
    expect(reference(c, base, base.paragraphs[0])).toBe("R1:C1-P1");
    expect(validateState(next)).toEqual(next);
  }
});

it("does not create a numbering edition for text-only edits or a new unused trailing address", () => {
  const { s, c, base } = fixture();
  for (const rows of [
    base.paragraphs.map((p) => ({ ...p, text: p.text + " edited" })),
    [...base.paragraphs, fresh()],
  ]) {
    const next = commit(s, c.id, base.id, rows, "Edit");
    expect(head(next, next.chapters[0]).edition).toBe(base.edition);
  }
});

it("reuses a deleted trailing position only in a new edition", () => {
  const initial = fixture();
  const base = initial.base;
  let { s, c } = initial;
  s = commit(s, c.id, base.id, base.paragraphs.slice(0, -1), "Remove tail");
  c = s.chapters[0];
  const shorter = head(s, c);
  s = commit(s, c.id, shorter.id, [...shorter.paragraphs, fresh()], "Append");
  const current = head(s, s.chapters[0]);
  expect(current.paragraphs.at(-1)?.label).toBe(4);
  expect(current.edition).toBeGreaterThan(base.edition);
  expect(s.revisions.find((r) => r.id === base.id)).toEqual(base);
});

it("migrates only unordered working heads once, preserving approvals, flags and proposals", () => {
  const { s, c, base } = fixture();
  // Legacy data uses nonconsecutive addresses within an immutable snapshot.
  base.paragraphs[3].label = 20;
  s.chapters[0].approvedId = base.id;
  const p: Proposal = {
    id: uid(),
    chapterId: c.id,
    baseRevisionId: base.id,
    title: "Older source",
    rationale: "",
    status: "pending",
    createdAt: now(),
    paragraphs: base.paragraphs.map((p, i) =>
      i === 3 ? { ...p, text: "Proposal ending" } : p,
    ),
  };
  s.proposals.push(p);
  s.flags.push({
    id: uid(),
    chapterId: c.id,
    revisionId: base.id,
    number: 1,
    paragraphIds: [base.paragraphs[3].id],
    quote: "Text 4",
    note: "Keep this",
    kind: "reference",
    status: "open",
    createdAt: now(),
  });
  validateState(s);
  const next = orderCurrentParagraphNumbers(s);
  expect(head(next, next.chapters[0]).paragraphs.map((p) => p.label)).toEqual([
    1, 2, 3, 4,
  ]);
  expect(next.revisions.slice(0, -1)).toEqual(s.revisions);
  expect(next.flags).toEqual(s.flags);
  expect(next.proposals).toEqual(s.proposals);
  expect(next.chapters[0].approvedId).toBe(base.id);
  expect(orderCurrentParagraphNumbers(next)).toBe(next);
  const accepted = acceptProposal(next, p);
  expect(head(accepted, accepted.chapters[0]).paragraphs[3].text).toBe(
    "Proposal ending",
  );
});

it("accepts a source-anchored proposal after automatic renumbering without touching unrelated prose", () => {
  const { s, c, base } = fixture();
  const p: Proposal = {
    id: uid(),
    chapterId: c.id,
    baseRevisionId: base.id,
    title: "Rewrite",
    rationale: "",
    status: "pending",
    createdAt: now(),
    paragraphs: base.paragraphs.map((p, i) =>
      i === 2 ? { ...p, text: "Proposed third" } : p,
    ),
  };
  s.proposals.push(p);
  const changed = commit(
    s,
    c.id,
    base.id,
    [fresh(), ...base.paragraphs],
    "Prepend",
  );
  const accepted = acceptProposal(changed, p);
  const current = head(accepted, accepted.chapters[0]);
  expect(current.paragraphs.map((p) => p.text)).toEqual([
    "Inserted",
    "Text 1",
    "Text 2",
    "Proposed third",
    "Text 4",
  ]);
  expect(current.paragraphs.map((p) => p.label)).toEqual([1, 2, 3, 4, 5]);
  expect(accepted.proposals[0].review?.selectedChangeIds).toEqual([
    base.paragraphs[2].id,
  ]);
  validateState(accepted);
});

it("does not treat changed display numbers as proposed prose changes", () => {
  const { base } = fixture();
  expect([
    ...changedParagraphIds(
      base.paragraphs,
      base.paragraphs.map((p) => ({ ...p, label: p.label + 10 })),
    ),
  ]).toEqual([]);
});

it("starts accepted new chapter drafts at P1 regardless of their proposed numbers", () => {
  const { s, c, base } = fixture();
  const id = uid();
  s.chapterProposals.push({
    id,
    bookId: c.bookId,
    title: "Next",
    synopsis: "",
    rationale: "",
    afterChapterId: c.id,
    paragraphs: base.paragraphs.map((p) => ({
      ...p,
      id: uid(),
      label: p.label * 10,
    })),
    status: "pending",
    createdAt: now(),
  });
  const proposal = s.chapterProposals[0];
  const next = acceptChapterProposal(s, id, {
    ...proposal,
    afterChapterId: c.id,
  });
  expect(
    head(
      next,
      next.chapters.find((c) => c.id === id)!,
    ).paragraphs.map((p) => p.label),
  ).toEqual([1, 2, 3, 4]);
  expect(next.chapterProposals[0].paragraphs).toEqual(proposal.paragraphs);
});

it("upgrades multiple active chapters as one batch and leaves trash unchanged until restored", () => {
  const initial = fixture();
  const c = initial.c;
  let s = initial.s;
  s = addChapter(s, c.bookId, "Second");
  s = addChapter(s, c.bookId, "Trash");
  for (const chapter of s.chapters)
    head(s, chapter).paragraphs.at(-1)!.label = 50;
  s.chapters[2].deletedAt = now();
  const source = structuredClone(s);
  const next = orderCurrentParagraphNumbers(s);
  expect(next.revisions.length).toBe(s.revisions.length + 2);
  expect(next.revisions.slice(0, s.revisions.length)).toEqual(source.revisions);
  expect(head(next, next.chapters[2]).paragraphs[0].label).toBe(50);
  expect(next.chapters[2]).toEqual(source.chapters[2]);
  delete next.chapters[2].deletedAt;
  const restored = orderCurrentParagraphNumbers(next);
  expect(head(restored, restored.chapters[2]).paragraphs[0].label).toBe(1);
  expect(orderCurrentParagraphNumbers(restored)).toBe(restored);
});

it("allocates an edition above retained branches so historical numbers remain unambiguous", () => {
  const { s, c, base } = fixture();
  s.revisions.push({
    ...base,
    id: uid(),
    parentId: base.id,
    edition: 9,
    paragraphs: [...base.paragraphs]
      .reverse()
      .map((p, i) => ({ ...p, label: i + 1 })),
  });
  const next = commit(
    s,
    c.id,
    base.id,
    [fresh(), ...base.paragraphs],
    "Insert",
  );
  expect(head(next, next.chapters[0]).edition).toBe(10);
});
