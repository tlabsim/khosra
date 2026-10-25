import { it, expect } from "vitest";
import { reconcile } from "../src/sync/reconcile";
import {
  emptyState,
  uid,
  now,
  addChapter,
  commit,
  head,
} from "../src/domain/model";
function fixture() {
  let s = emptyState();
  const id = uid();
  s.books.push({
    id,
    title: "Book",
    premise: "Premise",
    language: "bn",
    createdAt: now(),
  });
  s = addChapter(s, id, "Chapter");
  return s;
}
it("preserves divergent chapter heads and requires an explicit choice", () => {
  const base = fixture(),
    c = base.chapters[0],
    r = head(base, c);
  const local = commit(
    base,
    c.id,
    r.id,
    [{ ...r.paragraphs[0], text: "Local" }],
    "Local edit",
  );
  const remote = commit(
    base,
    c.id,
    r.id,
    [{ ...r.paragraphs[0], text: "Server" }],
    "Server edit",
  );
  expect(reconcile(local, remote).conflicts).toHaveLength(1);
  const merged = reconcile(local, remote, { [c.id]: "local" });
  expect(merged.conflicts).toHaveLength(0);
  expect(merged.state.revisions).toHaveLength(3);
  expect(head(merged.state, merged.state.chapters[0]).paragraphs[0].text).toBe(
    "Local",
  );
});
it("fast forwards related revisions without losing history", () => {
  const base = fixture(),
    c = base.chapters[0],
    r = head(base, c);
  const remote = commit(
    base,
    c.id,
    r.id,
    [{ ...r.paragraphs[0], text: "Server" }],
    "Later",
  );
  const merged = reconcile(base, remote);
  expect(merged.conflicts).toHaveLength(0);
  expect(merged.state.chapters[0].headId).toBe(remote.chapters[0].headId);
});
it("requires a decision when author metadata differs", () => {
  const local = fixture(),
    remote = structuredClone(local);
  remote.books[0].premise = "Different premise";
  expect(reconcile(local, remote).conflicts[0].kind).toBe("book");
});
it("retains divergent insertions even if both devices allocated the same readable label", () => {
  const base = fixture(),
    c = base.chapters[0],
    r = head(base, c);
  const local = commit(
    base,
    c.id,
    r.id,
    [
      ...r.paragraphs,
      { id: uid(), label: 2, text: "Local insertion", section: "" },
    ],
    "Local insert",
  );
  const remote = commit(
    base,
    c.id,
    r.id,
    [
      ...r.paragraphs,
      { id: uid(), label: 2, text: "Server insertion", section: "" },
    ],
    "Server insert",
  );
  const merged = reconcile(local, remote, { [c.id]: "local" });
  expect(merged.state.revisions).toHaveLength(3);
  expect(merged.conflicts).toHaveLength(0);
});
