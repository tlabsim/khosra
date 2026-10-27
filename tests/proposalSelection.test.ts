import { describe, it, expect } from "vitest";
import {
  proposalChanges,
  selectProposalChanges,
} from "../src/domain/proposalSelection";
import {
  emptyState,
  uid,
  now,
  addChapter,
  commit,
  head,
  acceptProposal,
  rejectProposal,
  validateState,
  type Proposal,
} from "../src/domain/model";
import { reconcile } from "../src/sync/reconcile";
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
  s = addChapter(s, bookId, "Chapter");
  const c = s.chapters[0],
    initial = head(s, c);
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: i ? uid() : initial.paragraphs[0].id,
    label: i + 1,
    text: `Original ${i + 1}`,
    section: "",
  }));
  s = commit(s, c.id, c.headId, rows, "Initial");
  const base = head(s, s.chapters[0]);
  const p: Proposal = {
    id: uid(),
    chapterId: c.id,
    baseRevisionId: base.id,
    title: "Changes",
    rationale: "",
    createdAt: now(),
    status: "pending",
    paragraphs: rows.map((p, i) =>
      i === 0 || i === 6 ? { ...p, text: `Proposed ${i + 1}` } : p,
    ),
  };
  s.proposals = [p];
  return { s, p, base, rows };
}
describe("selective proposal acceptance", () => {
  it("selects independent adjacent modifications separately", () => {
    const { rows } = fixture();
    const draft = rows.map((p, i) => (i < 2 ? { ...p, text: "New" } : p));
    expect(proposalChanges(rows, draft)).toHaveLength(2);
    expect(selectProposalChanges(rows, draft, [rows[0].id])[1]).toEqual(
      rows[1],
    );
  });
  it("keeps unselected latest text and unrelated insertions, parents the latest head, retains immutable source and receipt", () => {
    const { s, p, base, rows } = fixture();
    const original = structuredClone(p);
    const latest = commit(
      s,
      p.chapterId,
      base.id,
      rows.map((x, i) =>
        i === 6
          ? { ...x, text: "Author newest ending" }
          : i === 3
            ? { ...x, text: "Unrelated author text" }
            : x,
      ),
      "Author",
    );
    const next = acceptProposal(latest, p, p.paragraphs, {
      revisionId: latest.chapters[0].headId,
      choices: {},
      selectedChangeIds: [rows[0].id],
    });
    const result = head(next, next.chapters[0]);
    expect(result.paragraphs[0].text).toBe("Proposed 1");
    expect(result.paragraphs[6].text).toBe("Author newest ending");
    expect(result.paragraphs[3].text).toBe("Unrelated author text");
    expect(result.parentId).toBe(latest.chapters[0].headId);
    expect(next.proposals[0].status).toBe("partially-accepted");
    expect(next.proposals[0].paragraphs).toEqual(original.paragraphs);
    expect(s.proposals[0]).toEqual(original);
    expect(next.proposals[0].review?.declinedChangeIds).toEqual([rows[6].id]);
    expect(next.proposals[0].review?.resultRevisionId).toBe(result.id);
    expect(validateState(next)).toEqual(next);
    const synced = reconcile(s, next);
    expect(synced.state.proposals[0]).toEqual(next.proposals[0]);
    expect(synced.conflicts).toHaveLength(0);
    expect(reconcile(next, s).state.proposals[0]).toEqual(next.proposals[0]);
  });
  it("declines additions/deletions without resurrecting an author-deleted paragraph", () => {
    const { s, p, base, rows } = fixture();
    const added = { id: uid(), label: 9, text: "New scene", section: "" };
    const draft = [
      { ...rows[0], text: "Modified" },
      rows[1],
      rows[3],
      added,
      ...rows.slice(4),
    ];
    s.proposals = [{ ...p, paragraphs: draft }];
    const latest = commit(
      s,
      p.chapterId,
      base.id,
      rows.filter((x) => x.id !== rows[2].id),
      "Author deleted",
    );
    const next = acceptProposal(latest, s.proposals[0], draft, {
      revisionId: latest.chapters[0].headId,
      choices: {},
      selectedChangeIds: [rows[0].id],
    });
    const result = head(next, next.chapters[0]);
    expect(
      result.paragraphs.some((x) => x.id === rows[2].id || x.id === added.id),
    ).toBe(false);
    expect(result.paragraphs[0].text).toBe("Modified");
  });
  it("links fewer/more paragraph replacements and rejects incomplete group choices", () => {
    const { rows } = fixture();
    const added = { id: uid(), label: 9, text: "Split", section: "" };
    for (const draft of [
      [{ ...rows[0], text: "Merged" }, ...rows.slice(2)],
      [{ ...rows[0], text: "Split first" }, added, ...rows.slice(1)],
      [added, ...rows.slice(2)],
    ]) {
      const group = proposalChanges(rows, draft)[0];
      expect(group.linked).toBe(true);
      expect(() =>
        selectProposalChanges(rows, draft, [group.paragraphIds[0]]),
      ).toThrow("together");
      expect(selectProposalChanges(rows, draft, [])).toEqual(rows);
      expect(selectProposalChanges(rows, draft, group.paragraphIds)).toEqual(
        draft,
      );
    }
  });
  it("links reordered changes and retains exact order when accepting/declining", () => {
    const { rows } = fixture(),
      draft = [rows[2], rows[0], rows[1], ...rows.slice(3)];
    const [group] = proposalChanges(rows, draft);
    expect(() => selectProposalChanges(rows, draft, [rows[0].id])).toThrow(
      "together",
    );
    expect(selectProposalChanges(rows, draft, [])).toEqual(rows);
    expect(selectProposalChanges(rows, draft, group.paragraphIds)).toEqual(
      draft,
    );
  });
  it("rejects empty/unknown/duplicate selections and any stale confirmed revision", () => {
    const { s, p, base, rows } = fixture();
    for (const selected of [[], [uid()], [rows[0].id, rows[0].id]])
      expect(() =>
        acceptProposal(s, p, p.paragraphs, {
          revisionId: base.id,
          choices: {},
          selectedChangeIds: selected,
        }),
      ).toThrow();
    const newer = commit(
      s,
      p.chapterId,
      base.id,
      rows.map((x, i) => (i === 4 ? { ...x, text: "Later" } : x)),
      "Later",
    );
    expect(() =>
      acceptProposal(newer, p, p.paragraphs, {
        revisionId: base.id,
        choices: {},
        selectedChangeIds: [rows[0].id],
      }),
    ).toThrow("draft changed");
  });
  it("blocks selected overlaps until resolved but allows declining them", () => {
    const { s, p, base, rows } = fixture();
    const latest = commit(
      s,
      p.chapterId,
      base.id,
      rows.map((x, i) => (i === 0 ? { ...x, text: "Author conflict" } : x)),
      "Author",
    );
    const resolution = {
      revisionId: latest.chapters[0].headId,
      choices: {},
      selectedChangeIds: [rows[0].id],
    };
    expect(() => acceptProposal(latest, p, p.paragraphs, resolution)).toThrow(
      "both versions",
    );
    const next = acceptProposal(latest, p, p.paragraphs, {
      ...resolution,
      selectedChangeIds: [rows[6].id],
    });
    expect(head(next, next.chapters[0]).paragraphs[0].text).toBe(
      "Author conflict",
    );
  });
  it("records full acceptance, safely rejects once, and refuses terminal/invalid receipts", () => {
    const { s, p, base } = fixture();
    const accepted = acceptProposal(s, p, p.paragraphs, {
      revisionId: base.id,
      choices: {},
      selectedChangeIds: proposalChanges(base.paragraphs, p.paragraphs).flatMap(
        (g) => g.paragraphIds,
      ),
    });
    expect(accepted.proposals[0].status).toBe("accepted");
    expect(validateState(accepted)).toEqual(accepted);
    expect(() => rejectProposal(accepted, p.id)).toThrow("already reviewed");
    const rejected = rejectProposal(s, p.id);
    expect(rejected.revisions).toEqual(s.revisions);
    expect(() => acceptProposal(rejected, p)).toThrow("already reviewed");
    const invalid = structuredClone(accepted);
    invalid.proposals[0].status = "partially-accepted";
    expect(() => validateState(invalid)).toThrow("review record");
  });
  it("preserves original content for every subset of independent replacements", () => {
    const { rows } = fixture();
    const draft = rows.map((p) => ({ ...p, text: `New ${p.label}` }));
    for (let mask = 0; mask < 256; mask++) {
      const ids = rows.filter((_, i) => mask & (1 << i)).map((p) => p.id);
      const selected = selectProposalChanges(rows, draft, ids);
      expect(selected.map((p) => p.text)).toEqual(
        rows.map((p, i) => (mask & (1 << i) ? draft[i].text : p.text)),
      );
    }
  });
});
