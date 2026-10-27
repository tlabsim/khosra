import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  emptyState,
  uid,
  now,
  addChapter,
  head,
  commit,
  renumber,
  acceptProposal,
  validateState,
  nextParagraphLabel,
  chapterReplacement,
  reincorporate,
  type Proposal,
} from "../src/domain/model";
import {
  exportBackup,
  importBackup,
  saveState,
  readState,
} from "../src/storage/db";
function fixture() {
  let s = emptyState();
  const id = uid();
  s.books.push({
    id,
    title: "রহস্য",
    premise: "চার বন্ধু",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, id, "প্রথম অধ্যায়");
  const c = s.chapters[0],
    r = head(s, c);
  s = commit(
    s,
    c.id,
    r.id,
    [
      {
        id: r.paragraphs[0].id,
        label: 1,
        text: "ঈশান বলল, “চলো।”",
        section: "",
      },
      { id: uid(), label: 2, text: "রাহুল ফিরে তাকাল।", section: "" },
    ],
    "Initial text",
  );
  return s;
}
describe("manuscript integrity", () => {
  it("keeps paragraph identity and labels on insertion before it", () => {
    const s = fixture(),
      c = s.chapters[0],
      r = head(s, c),
      p = { id: uid(), label: 3, text: "নতুন অনুচ্ছেদ।", section: "" };
    const next = commit(s, c.id, r.id, [p, ...r.paragraphs], "Insert");
    expect(head(next, next.chapters[0]).paragraphs[1]).toEqual(r.paragraphs[0]);
    expect(next.revisions.find((x) => x.id === r.id)).toEqual(r);
  });
  it("renumbers a new edition while retaining original references", () => {
    const s = fixture(),
      c = s.chapters[0],
      r = head(s, c);
    const next = renumber(s, c);
    expect(head(next, next.chapters[0]).edition).toBe(2);
    expect(next.revisions.find((x) => x.id === r.id)?.edition).toBe(1);
    expect(head(next, next.chapters[0]).paragraphs.map((p) => p.id)).toEqual(
      r.paragraphs.map((p) => p.id),
    );
  });
  it("blocks overlapping edits until the author resolves them", () => {
    const s = fixture(),
      c = s.chapters[0],
      r = head(s, c);
    const p: Proposal = {
      id: uid(),
      chapterId: c.id,
      baseRevisionId: r.id,
      title: "Rewrite",
      rationale: "Tone",
      paragraphs: r.paragraphs.map((x) => ({ ...x, text: "Proposed edit" })),
      status: "pending",
      createdAt: now(),
    };
    s.proposals.push(p);
    const next = commit(
      s,
      c.id,
      r.id,
      r.paragraphs.map((x) => ({ ...x, text: "Author edit" })),
      "Manual",
    );
    expect(() => acceptProposal(next, p)).toThrow("changed");
    expect(head(next, next.chapters[0]).paragraphs[0].text).toBe("Author edit");
  });
  it("accepts an author-adjusted proposal without losing original", () => {
    let s = fixture();
    const c = s.chapters[0],
      r = head(s, c);
    const p: Proposal = {
      id: uid(),
      chapterId: c.id,
      baseRevisionId: r.id,
      title: "Rewrite",
      rationale: "Tone",
      paragraphs: r.paragraphs,
      status: "pending",
      createdAt: now(),
    };
    s = { ...s, proposals: [p] };
    const next = acceptProposal(
      s,
      p,
      r.paragraphs.map((x) => ({ ...x, text: "Reviewed text" })),
    );
    expect(next.proposals[0].status).toBe("accepted");
    expect(next.revisions.find((x) => x.id === r.id)).toEqual(r);
    expect(head(next, next.chapters[0]).source).toBe("proposal");
  });
  it("preserves flag anchors after deletion and retains source text", () => {
    let s = fixture();
    const c = s.chapters[0],
      r = head(s, c);
    s.flags.push({
      id: uid(),
      number: 1,
      chapterId: c.id,
      revisionId: r.id,
      paragraphIds: [r.paragraphs[0].id],
      quote: r.paragraphs[0].text,
      note: "Rewrite",
      kind: "rewrite",
      status: "open",
      createdAt: now(),
    });
    s = commit(s, c.id, r.id, r.paragraphs.slice(1), "Delete");
    expect(validateState(s).flags[0].revisionId).toBe(r.id);
    expect(
      s.revisions.find((x) => x.id === r.id)?.paragraphs[0].text,
    ).toContain("ঈশান");
  });
  it("rejects duplicate paragraph IDs and broken archive references", () => {
    const s = fixture(),
      r = head(s, s.chapters[0]);
    r.paragraphs.push(r.paragraphs[0]);
    expect(() => validateState(s)).toThrow("Invalid revision");
  });
  it("round trips Bengali, quotes and full history through backup and IndexedDB", async () => {
    const s = fixture();
    await saveState(s);
    expect(await readState()).toEqual(s);
    const archive = await exportBackup(s);
    expect(await importBackup(archive)).toEqual(s);
  });
  it("rejects corrupted archives before any restore", async () => {
    const s = fixture();
    const archive = JSON.parse(await exportBackup(s));
    archive.payload += " ";
    await expect(importBackup(JSON.stringify(archive))).rejects.toThrow(
      "damaged",
    );
  });
  it("context becomes detectably stale after manual edits", () => {
    let s = fixture();
    const c = s.chapters[0],
      r = head(s, c);
    s.contexts.push({
      id: uid(),
      chapterId: c.id,
      revisionId: r.id,
      summary: "Summary",
      facts: [],
      createdAt: now(),
    });
    s = commit(s, c.id, r.id, r.paragraphs, "Change");
    expect(s.contexts[0].revisionId).not.toBe(s.chapters[0].headId);
  });
});

it("rejects early prototype exports as unsupported archives", async () => {
  await expect(
    importBackup(
      JSON.stringify({
        app: "Khosra",
        chapters: [{ id: 1, title: "প্রথম", content: "পুরোনো লেখা।" }],
        versions: {},
        notes: [],
      }),
    ),
  ).rejects.toThrow("Archive is damaged or unsupported. Nothing was imported.");
});

it("never recycles a deleted paragraph address within an edition", () => {
  let s = fixture();
  const c = s.chapters[0],
    r = head(s, c);
  s = commit(s, c.id, r.id, r.paragraphs.slice(0, 1), "Delete highest label");
  expect(nextParagraphLabel(s, s.chapters[0])).toBe(3);
});
it("rejects reassignment of a historical address to another paragraph", () => {
  const s = fixture(),
    c = s.chapters[0],
    r = head(s, c);
  expect(() =>
    commit(
      s,
      c.id,
      r.id,
      [{ ...r.paragraphs[0], id: uid() }],
      "Invalid reassignment",
    ),
  ).toThrow("cannot be reassigned");
});
it("reincorporates earlier text into current address edition", () => {
  let s = fixture();
  const old = head(s, s.chapters[0]);
  s = renumber(s, s.chapters[0]);
  const c = s.chapters[0];
  const restored = reincorporate(s, c, old.paragraphs);
  expect(restored.map((p) => p.id)).toEqual(old.paragraphs.map((p) => p.id));
  expect(() =>
    commit(s, c.id, c.headId, restored, "Restore", "restore"),
  ).not.toThrow();
});

describe("chapter paste references", () => {
  it("fills the initial P1 placeholder and leaves the empty revision immutable", () => {
    const s = addChapter(emptyState(), "book", "New");
    const c = s.chapters[0],
      r = head(s, c);
    const original = structuredClone(r);
    const ps = chapterReplacement(s, c, ["প্রথম।", "—দ্বিতীয়।"]);
    expect(ps.map((p) => p.label)).toEqual([1, 2]);
    expect(ps[0].id).toBe(r.paragraphs[0].id);
    expect(r).toEqual(original);
  });
  it("never reuses historical addresses after clearing prose", () => {
    let s = fixture();
    const c = s.chapters[0],
      r = head(s, c);
    s = commit(s, c.id, r.id, [{ ...r.paragraphs[0], text: "" }], "Clear");
    const ps = chapterReplacement(s, s.chapters[0], ["New prose"]);
    expect(ps[0].label).toBe(3);
    expect(ps[0].id).not.toBe(r.paragraphs[0].id);
  });
  it("preserves unchanged duplicate paragraphs once each and allocates unused labels", () => {
    const s = fixture(),
      c = s.chapters[0],
      r = head(s, c);
    const ps = chapterReplacement(s, c, [
      r.paragraphs[1].text,
      r.paragraphs[1].text,
      "New",
    ]);
    expect(ps[0]).toEqual(r.paragraphs[1]);
    expect(ps.map((p) => p.label)).toEqual([2, 3, 4]);
    expect(new Set(ps.map((p) => p.id)).size).toBe(3);
  });
});
