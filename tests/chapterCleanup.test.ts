import { acceptChapterProposal } from "../src/domain/chapterProposals";
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  emptyState,
  uid,
  now,
  addChapter,
  acceptProposal,
  validateState,
} from "../src/domain/model";
import {
  cleanChapter,
  chapterCleanupPlan,
  workspaceBytes,
} from "../src/domain/chapterCleanup";
import { reconcile } from "../src/sync/reconcile";
import { exportBackup, importBackup } from "../src/storage/db";
function fixture() {
  let s = emptyState();
  const bookId = uid();
  s.books.push({
    id: bookId,
    title: "Mystery",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, bookId, "Finished chapter");
  s = addChapter(s, bookId, "Other chapter");
  const c = s.chapters[0],
    r = s.revisions.find((r) => r.id === c.headId)!;
  r.paragraphs[0].text = "নদীর ধারে একটি রহস্য। ".repeat(1000);
  const p = {
    id: uid(),
    chapterId: c.id,
    baseRevisionId: r.id,
    title: "Rewrite",
    rationale: "Tone",
    paragraphs: r.paragraphs.map((p) => ({
      ...p,
      text: p.text + "একটি সূত্র।",
    })),
    status: "pending" as const,
    createdAt: now(),
  };
  s.proposals.push(p);
  s = acceptProposal(s, p);
  s.chapters[0].approvedId = c.headId;
  s.proposals.push({ ...p, id: uid(), status: "rejected" });
  s.proposals.push({ ...p, id: uid() });
  s.proposals.push({
    ...p,
    id: uid(),
    chapterId: s.chapters[1].id,
    baseRevisionId: s.chapters[1].headId,
    paragraphs: [],
    status: "rejected",
  });
  for (let i = 0; i < 3; i++)
    s.contexts.push({
      id: uid(),
      chapterId: c.id,
      revisionId: c.headId,
      summary: `Index ${i}`,
      facts: [],
      createdAt: now(),
    });
  s.flags.push({
    id: uid(),
    number: 1,
    chapterId: c.id,
    revisionId: r.id,
    paragraphIds: [r.paragraphs[0].id],
    quote: "রহস্য",
    note: "Retain this note",
    kind: "discussion",
    status: "resolved",
    createdAt: now(),
  });
  return validateState(s);
}
describe("chapter cleanup", () => {
  it("cleans accepted new-chapter suggestion copies while retaining the created chapter and root", () => {
    let s = fixture();
    const id = uid();
    const proposal = {
      id,
      bookId: s.books[0].id,
      title: "Suggested chapter",
      synopsis: "",
      rationale: "Continue",
      afterChapterId: s.chapters[0].id,
      paragraphs: [{ id: uid(), label: 1, text: "The next clue", section: "" }],
      status: "pending" as const,
      createdAt: now(),
    };
    s.chapterProposals.push(proposal);
    s = acceptChapterProposal(s, id, proposal);
    const before = structuredClone(s);
    const next = cleanChapter(s, id);
    expect(next.chapterProposals).toEqual([]);
    expect(next.chapters).toEqual(before.chapters);
    expect(next.revisions).toEqual(before.revisions);
    expect(reconcile(before, next).state.chapterProposals).toEqual([]);
  });

  it("removes reviewed copies and obsolete indexes, preserving all source and pending work", () => {
    const s = fixture(),
      before = structuredClone(s),
      c = s.chapters[0];
    const plan = chapterCleanupPlan(s, c.id);
    expect(plan.proposalIds).toHaveLength(2);
    expect(plan.contextIds).toHaveLength(2);
    const next = cleanChapter(s, c.id);
    expect(s).toEqual(before);
    expect(next.proposals.map((p) => p.id)).toEqual(
      s.proposals.slice(2).map((p) => p.id),
    );
    expect(next.contexts).toEqual(s.contexts.slice(-1));
    for (const key of [
      "books",
      "chapters",
      "revisions",
      "flags",
      "materials",
      "files",
      "materialDeletions",
    ] as const)
      expect(next[key]).toEqual(s[key]);
    expect(workspaceBytes(next)).toBeLessThan(workspaceBytes(s) * 0.7);
  });
  it("is a no-op on an already-clean chapter", () => {
    const s = fixture(),
      next = cleanChapter(s, s.chapters[0].id);
    expect(cleanChapter(next, s.chapters[0].id)).toBe(next);
  });
  it("prevents old copies and pending versions from resurrecting removed proposals in either sync direction", () => {
    const s = fixture(),
      cleaned = cleanChapter(s, s.chapters[0].id),
      old = structuredClone(s);
    old.proposals[0].status = "pending";
    delete old.proposals[0].review;
    for (const [a, b] of [
      [old, cleaned],
      [cleaned, old],
    ]) {
      const merged = reconcile(a, b);
      expect(merged.conflicts).toEqual([]);
      expect(merged.state.proposals).toEqual(cleaned.proposals);
      expect(merged.state.contexts).toEqual(cleaned.contexts);
    }
  });
  it("preserves new proposals and new author revisions from an older device", () => {
    const s = fixture(),
      cleaned = cleanChapter(s, s.chapters[0].id),
      old = structuredClone(s);
    const p = { ...old.proposals[2], id: uid() };
    old.proposals.push(p);
    const base = old.revisions.find((r) => r.id === old.chapters[0].headId)!;
    const r = {
      ...base,
      id: uid(),
      parentId: base.id,
      paragraphs: base.paragraphs.map((p) => ({
        ...p,
        text: "Unsynced prose",
      })),
    };
    old.revisions.push(r);
    old.chapters[0].headId = r.id;
    const merged = reconcile(old, cleaned);
    expect(merged.conflicts).toEqual([]);
    expect(merged.state.proposals).toContainEqual(p);
    expect(merged.state.chapters[0].headId).toBe(r.id);
  });
  it("handles overlapping concurrent cleanup receipts without restoring copies", () => {
    const s = fixture(),
      a = cleanChapter(s, s.chapters[0].id),
      b = cleanChapter(s, s.chapters[0].id);
    const next = reconcile(a, b).state;
    expect(next.chapterCleanups).toHaveLength(2);
    expect(next.proposals).toEqual(a.proposals);
  });
  it("requires missing records to stay absent and validates receipt targets", () => {
    const s = fixture(),
      next = cleanChapter(s, s.chapters[0].id);
    expect(() => validateState({ ...next, proposals: s.proposals })).toThrow(
      "Cleaned records",
    );
    const bad = structuredClone(next);
    bad.chapterCleanups[0].proposalIds.push(
      bad.chapterCleanups[0].proposalIds[0],
    );
    expect(() => validateState(bad)).toThrow("Duplicate cleanup");
    bad.chapterCleanups[0].chapterId = uid();
    expect(() => validateState(bad)).toThrow("Cleanup chapter");
  });
  it("refuses missing or trashed chapters", () => {
    const s = fixture();
    expect(() => cleanChapter(s, uid())).toThrow("active chapter");
    s.chapters[0].deletedAt = now();
    expect(() => cleanChapter(s, s.chapters[0].id)).toThrow("active chapter");
  });
  it("supports old archives and verifies backups before and after cleanup", async () => {
    const s = fixture(),
      old = { ...s } as Partial<typeof s>;
    delete old.chapterCleanups;
    expect(validateState(old).chapterCleanups).toEqual([]);
    const archive = await exportBackup(s);
    const next = cleanChapter(s, s.chapters[0].id);
    expect(await importBackup(archive)).toEqual(s);
    expect(await importBackup(await exportBackup(next))).toEqual(next);
    expect(
      reconcile(await importBackup(archive), next).state.proposals,
    ).toEqual(next.proposals);
  });
});
