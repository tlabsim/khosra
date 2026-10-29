import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  emptyState,
  uid,
  now,
  addChapter,
  validateState,
  head,
  type ChapterProposal,
} from "../src/domain/model";
import {
  acceptChapterProposal,
  rejectChapterProposal,
} from "../src/domain/chapterProposals";
import { manuscriptChapters, trashChapter } from "../src/domain/chapters";
import { reconcile } from "../src/sync/reconcile";
import { exportBackup, importBackup } from "../src/storage/db";
import { acceptedProposalParagraphs } from "../src/domain/proposalPresentation";
function fixture() {
  const s = emptyState(),
    bookId = uid();
  s.books.push({
    id: bookId,
    title: "রহস্য",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  const p: ChapterProposal = {
    id: uid(),
    bookId,
    title: "নতুন অধ্যায়",
    synopsis: "A new clue",
    rationale: "Continue the story",
    afterChapterId: null,
    paragraphs: [
      { id: uid(), label: 1, section: "", text: "একটি নতুন সূত্র।" },
    ],
    status: "pending",
    createdAt: now(),
  };
  s.chapterProposals.push(p);
  return { s, p };
}
describe("author-confirmed new chapters", () => {
  it("loads old archives with an empty proposal collection", () => {
    const old: Record<string, unknown> = { ...emptyState() };
    delete old.chapterProposals;
    expect(validateState(old).chapterProposals).toEqual([]);
    expect(() => validateState({ ...old, chapterProposals: null })).toThrow();
  });
  it("creates no chapter until acceptance, retains the suggestion, and accepts author edits", async () => {
    const { s, p } = fixture();
    expect(validateState(s).chapters).toEqual([]);
    const draft = {
      ...p,
      title: "Author title",
      synopsis: "Author synopsis",
      paragraphs: [{ ...p.paragraphs[0], text: "Author-edited draft" }],
    };
    const accepted = acceptChapterProposal(s, p.id, draft);
    expect(s.chapters).toEqual([]);
    expect(accepted.chapters).toHaveLength(1);
    const c = accepted.chapters[0];
    expect(c).toMatchObject({
      title: draft.title,
      synopsis: draft.synopsis,
      approvedId: null,
      code: 1,
    });
    expect(head(accepted, c)).toMatchObject({
      source: "proposal",
      parentId: null,
      paragraphs: draft.paragraphs,
    });
    expect(accepted.chapterProposals[0]).toMatchObject({
      ...p,
      status: "accepted",
      review: { chapterId: c.id, revisionId: c.headId, title: draft.title },
    });
    expect(
      acceptedProposalParagraphs(accepted.revisions, head(accepted, c)),
    ).toEqual(new Set([p.paragraphs[0].id]));
    expect(await importBackup(await exportBackup(accepted))).toEqual(accepted);
    expect(() => acceptChapterProposal(accepted, p.id, draft)).toThrow(
      /already/,
    );
    expect(() => rejectChapterProposal(accepted, p.id)).toThrow(/already/);
  });
  it("validates without changing source title whitespace during sync", () => {
    const { s, p } = fixture();
    p.title = "  Original title  ";
    expect(validateState(s).chapterProposals[0].title).toBe(p.title);
    const accepted = acceptChapterProposal(s, p.id, p);
    expect(accepted.chapters[0].title).toBe("Original title");
    expect(accepted.chapterProposals[0].title).toBe(p.title);
  });
  it("rejects without creating any manuscript or revision", () => {
    const { s, p } = fixture();
    const rejected = rejectChapterProposal(s, p.id);
    expect(rejected.chapters).toEqual([]);
    expect(rejected.revisions).toEqual([]);
    expect(rejected.chapterProposals[0].status).toBe("rejected");
    expect(() => acceptChapterProposal(rejected, p.id, p)).toThrow(/already/);
  });
  it("inserts after an anchor and allocates codes including trash without renumbering", () => {
    const { s, p } = fixture();
    let state = addChapter(
      addChapter(addChapter(s, p.bookId, "First"), p.bookId, "Second"),
      p.bookId,
      "Trashed",
    );
    state = trashChapter(state, state.chapters[2].id);
    const old = structuredClone(state.revisions);
    const accepted = acceptChapterProposal(state, p.id, {
      ...p,
      afterChapterId: state.chapters[0].id,
    });
    expect(manuscriptChapters(accepted, p.bookId).map((c) => c.title)).toEqual([
      "First",
      p.title,
      "Second",
    ]);
    expect(accepted.chapters.find((c) => c.id === p.id)?.code).toBe(4);
    expect(accepted.chapters.slice(0, 3).map((c) => c.code)).toEqual([1, 2, 3]);
    expect(accepted.revisions.slice(0, 3)).toEqual(old);
  });
  it("refuses a missing, trashed or foreign anchor and invalid author edits", () => {
    const { s, p } = fixture();
    expect(() =>
      acceptChapterProposal(s, p.id, { ...p, afterChapterId: uid() }),
    ).toThrow(/position/);
    let state = addChapter(s, p.bookId, "Gone");
    state = trashChapter(state, state.chapters[0].id);
    expect(() =>
      acceptChapterProposal(state, p.id, {
        ...p,
        afterChapterId: state.chapters[0].id,
      }),
    ).toThrow(/position/);
    expect(() =>
      acceptChapterProposal(s, p.id, { ...p, title: " " }),
    ).toThrow();
    expect(() =>
      acceptChapterProposal(s, p.id, { ...p, paragraphs: [] }),
    ).toThrow();
    expect(() =>
      validateState({
        ...s,
        chapterProposals: [
          { ...p, paragraphs: [p.paragraphs[0], p.paragraphs[0]] },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateState({ ...s, chapterProposals: [{ ...p, status: "accepted" }] }),
    ).toThrow();
  });
  it("retains new server proposals alongside local edits and prevents resurrection of reviewed proposals", () => {
    const { s, p } = fixture();
    const local = structuredClone(s);
    local.chapterProposals = [];
    local.books[0].premise = "local idea";
    const merged = reconcile(local, s, { [p.bookId]: "local" }).state;
    expect(merged.books[0].premise).toBe("local idea");
    expect(merged.chapterProposals).toEqual([p]);
    const accepted = acceptChapterProposal(s, p.id, p);
    const again = reconcile(s, accepted).state;
    expect(again.chapters).toHaveLength(1);
    expect(again.chapterProposals[0].status).toBe("accepted");
    expect(reconcile(accepted, s).state.chapters).toHaveLength(1);
    const tampered = structuredClone(s);
    tampered.chapterProposals[0].title = "altered";
    expect(() => reconcile(tampered, s)).toThrow(/content differs/);
    expect(() => reconcile(rejectChapterProposal(s, p.id), accepted)).toThrow(
      /reviewed differently/,
    );
  });
});
