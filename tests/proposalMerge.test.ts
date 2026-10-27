import { describe, it, expect } from "vitest";
import { mergeProposal } from "../src/domain/proposalMerge";
import {
  emptyState,
  uid,
  now,
  addChapter,
  commit,
  head,
  acceptProposal,
  renumber,
  type Paragraph,
  type Proposal,
} from "../src/domain/model";
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
  s = addChapter(s, bookId, "Opening");
  let c = s.chapters[0];
  const initial = head(s, c);
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: i === 0 ? initial.paragraphs[0].id : uid(),
    label: i + 1,
    text: `Original ${i + 1}`,
    section: "",
  }));
  s = commit(s, c.id, c.headId, rows, "Initial");
  c = s.chapters[0];
  const base = head(s, c);
  const p: Proposal = {
    id: uid(),
    chapterId: c.id,
    baseRevisionId: base.id,
    title: "Opening revision",
    rationale: "Change P1 only",
    paragraphs: base.paragraphs.map((x, i) =>
      i === 0 ? { ...x, text: "Proposed opening" } : x,
    ),
    status: "pending",
    createdAt: now(),
  };
  s.proposals.push(p);
  return { s, c, base, p };
}
function edit(
  s: ReturnType<typeof fixture>["s"],
  fn: (rows: Paragraph[]) => Paragraph[],
) {
  const c = s.chapters[0];
  return commit(s, c.id, c.headId, fn(head(s, c).paragraphs), "Author edit");
}
describe("three-way proposal acceptance", () => {
  it("accepts an older proposal while retaining edits elsewhere and parenting the latest revision", () => {
    const { s, p, base } = fixture();
    const changed = edit(s, (rows) =>
      rows.map((x, i) => (i === 4 ? { ...x, text: "Author ending" } : x)),
    );
    const current = head(changed, changed.chapters[0]);
    const accepted = acceptProposal(changed, p);
    const r = head(accepted, accepted.chapters[0]);
    expect(r.paragraphs.map((x) => x.text)).toEqual([
      "Proposed opening",
      "Original 2",
      "Original 3",
      "Original 4",
      "Author ending",
    ]);
    expect(r.parentId).toBe(current.id);
    expect(accepted.revisions.find((x) => x.id === base.id)).toEqual(base);
    expect(accepted.proposals[0].status).toBe("accepted");
  });
  it("requires an explicit decision for an overlapping paragraph and supports either choice", () => {
    const { s, p } = fixture();
    const changed = edit(s, (rows) =>
      rows.map((x, i) => (i === 0 ? { ...x, text: "Author opening" } : x)),
    );
    const c = changed.chapters[0],
      r = head(changed, c),
      id = p.paragraphs[0].id;
    expect(() => acceptProposal(changed, p)).toThrow("both versions");
    for (const choice of ["current", "proposal"] as const) {
      const next = acceptProposal(changed, p, p.paragraphs, {
        revisionId: r.id,
        choices: { [id]: choice },
      });
      expect(head(next, next.chapters[0]).paragraphs[0].text).toBe(
        choice === "current" ? "Author opening" : "Proposed opening",
      );
      expect(next.revisions.find((x) => x.id === r.id)).toEqual(r);
    }
  });
  it("keeps an explicit overlap choice valid when only another paragraph changes later", () => {
    const { s, p } = fixture();
    const changed = edit(s, (rows) =>
      rows.map((x, i) => (i === 0 ? { ...x, text: "Author opening" } : x)),
    );
    const reviewed = head(changed, changed.chapters[0]);
    const newer = edit(changed, (rows) =>
      rows.map((x, i) => (i === 4 ? { ...x, text: "A newer ending" } : x)),
    );
    const next = acceptProposal(newer, p, p.paragraphs, {
      revisionId: reviewed.id,
      choices: { [p.paragraphs[0].id]: "proposal" },
    });
    const rows = head(next, next.chapters[0]).paragraphs;
    expect(rows[0].text).toBe("Proposed opening");
    expect(rows[4].text).toBe("A newer ending");
  });
  it("rejects stale conflict choices when another revision arrives", () => {
    const { s, p } = fixture();
    const changed = edit(s, (rows) =>
      rows.map((x, i) => (i === 0 ? { ...x, text: "Author opening" } : x)),
    );
    const reviewed = head(changed, changed.chapters[0]);
    const newer = edit(changed, (rows) =>
      rows.map((x, i) => (i === 0 ? { ...x, text: "Another opening" } : x)),
    );
    expect(() =>
      acceptProposal(newer, p, p.paragraphs, {
        revisionId: reviewed.id,
        choices: { [p.paragraphs[0].id]: "proposal" },
      }),
    ).toThrow("changed again");
  });
  it("recognizes a proposal already incorporated into the current text", () => {
    const { s, p } = fixture();
    const changed = edit(s, () => p.paragraphs);
    expect(() => acceptProposal(changed, p)).not.toThrow();
  });
  it("preserves current insertions/deletions and applies a proposal range with fewer paragraphs", () => {
    const { s, p, base } = fixture();
    const inserted = {
      id: uid(),
      label: 6,
      text: "Author addition",
      section: "",
    };
    const changed = edit(s, (rows) => [
      ...rows.slice(0, 3),
      inserted,
      ...rows.slice(3, 4),
    ]);
    const proposal = {
      ...p,
      paragraphs: [
        { ...base.paragraphs[0], text: "Combined opening" },
        ...base.paragraphs.slice(2),
      ],
    };
    changed.proposals = [proposal];
    const next = acceptProposal(changed, proposal);
    expect(head(next, next.chapters[0]).paragraphs.map((x) => x.text)).toEqual([
      "Combined opening",
      "Original 3",
      "Author addition",
      "Original 4",
    ]);
  });
  it("keeps both independent insertions and allocates new labels without stealing current or reserved ones", () => {
    const { s, p, base } = fixture();
    const author = {
        id: uid(),
        label: 6,
        text: "Author inserted",
        section: "",
      },
      model = { id: uid(), label: 6, text: "Model inserted", section: "" };
    const changed = edit(s, (rows) => [...rows, author]);
    const proposal = {
      ...p,
      paragraphs: [
        ...p.paragraphs.slice(0, 1),
        model,
        ...p.paragraphs.slice(1),
      ],
    };
    changed.proposals = [proposal];
    const next = acceptProposal(changed, proposal),
      rows = head(next, next.chapters[0]).paragraphs;
    expect(rows.find((x) => x.id === author.id)?.label).toBe(6);
    expect(rows.find((x) => x.id === model.id)?.label).toBe(7);
    expect(new Set(rows.map((x) => x.id)).size).toBe(7);
    expect(next.revisions.find((x) => x.id === base.id)).toEqual(base);
  });
  it("does not reuse addresses reserved by a paragraph deleted after proposal creation", () => {
    const { s, p } = fixture();
    const occupied = { id: uid(), label: 6, text: "Temporary", section: "" };
    let changed = edit(s, (rows) => [...rows, occupied]);
    changed = edit(changed, (rows) => rows.filter((x) => x.id !== occupied.id));
    const proposal = {
      ...p,
      paragraphs: [
        ...p.paragraphs,
        { id: uid(), label: 6, text: "New model ending", section: "" },
      ],
    };
    changed.proposals = [proposal];
    const next = acceptProposal(changed, proposal);
    expect(head(next, next.chapters[0]).paragraphs.at(-1)?.label).toBe(7);
  });
  it("handles multiple inserted label collisions without creating duplicate addresses", () => {
    const { s, p } = fixture();
    const changed = edit(s, (rows) => [
      ...rows,
      { id: uid(), label: 6, text: "Author addition", section: "" },
    ]);
    const proposal = {
      ...p,
      paragraphs: [
        ...p.paragraphs,
        { id: uid(), label: 7, text: "New A", section: "" },
        { id: uid(), label: 6, text: "New B", section: "" },
      ],
    };
    changed.proposals = [proposal];
    const next = acceptProposal(changed, proposal);
    expect(
      new Set(head(next, next.chapters[0]).paragraphs.map((x) => x.label)).size,
    ).toBe(8);
  });
  it("accepts across an author renumbering while preserving the current reference edition", () => {
    const { s, p } = fixture();
    const changed = renumber(s, s.chapters[0]);
    const next = acceptProposal(changed, p);
    expect(head(next, next.chapters[0]).edition).toBe(2);
    expect(head(next, next.chapters[0]).paragraphs[0].text).toBe(
      "Proposed opening",
    );
  });
  it("turns edit-versus-delete into a choice instead of resurrecting or erasing silently", () => {
    const { s, p, base } = fixture();
    const changed = edit(s, (rows) => rows.slice(1));
    expect(() => acceptProposal(changed, p)).toThrow("P1");
    const kept = acceptProposal(changed, p, p.paragraphs, {
      revisionId: changed.chapters[0].headId,
      choices: { [base.paragraphs[0].id]: "current" },
    });
    expect(head(kept, kept.chapters[0]).paragraphs).toHaveLength(4);
  });
  it("preserves moved paragraph edits and asks for an order choice only for incompatible moves", () => {
    const { base } = fixture();
    const rows = base.paragraphs;
    const p = [rows[1], rows[0], ...rows.slice(2)];
    const c = rows.map((x, i) =>
      i === 0 ? { ...x, text: "Author changed moved text" } : x,
    );
    const merged = mergeProposal(rows, p, c);
    expect(merged.unresolved).toEqual([]);
    expect(merged.paragraphs[1].text).toBe("Author changed moved text");
    const other = [rows[0], rows[2], rows[1], ...rows.slice(3)];
    expect(mergeProposal(rows, p, other).unresolved[0].kind).toBe("order");
    for (const choice of ["current", "proposal"] as const) {
      const result = mergeProposal(rows, p, other, {
        "paragraph-order": choice,
      });
      expect(result.unresolved).toEqual([]);
      expect(result.paragraphs.map((x) => x.id)).toEqual(
        (choice === "current" ? other : p).map((x) => x.id),
      );
    }
  });
  it("requires a choice when a moved paragraph was deleted on the other side", () => {
    const { base } = fixture(),
      rows = base.paragraphs;
    const moved = [...rows.slice(1), rows[0]],
      deleted = rows.slice(1);
    expect(
      mergeProposal(rows, moved, deleted).unresolved.map((c) => c.id),
    ).toContain(rows[0].id);
    expect(
      mergeProposal(rows, deleted, moved).unresolved.map((c) => c.id),
    ).toContain(rows[0].id);
    const kept = mergeProposal(rows, deleted, moved, {
      [rows[0].id]: "current",
    });
    expect(kept.paragraphs.map((p) => p.id)).toEqual(moved.map((p) => p.id));
  });
  it("refuses already reviewed or trashed proposals", () => {
    const { s, p } = fixture();
    s.proposals[0] = { ...p, status: "rejected" };
    expect(() => acceptProposal(s, p)).toThrow("already reviewed");
    s.proposals[0] = p;
    s.chapters[0].deletedAt = now();
    expect(() => acceptProposal(s, p)).toThrow("Trash");
  });
});
