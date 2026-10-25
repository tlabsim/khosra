import { expect, it } from "vitest";
import type { Revision } from "../src/domain/model";
import {
  historyGroups,
  isEmptyCleanup,
  visibleHead,
} from "../src/domain/history";
const a = { id: "a", label: 1, text: "Kept", section: "" };
const blank = { id: "blank", label: 2, text: "  ", section: "" };
const parent = {
  id: "old",
  parentId: null,
  edition: 1,
  source: "author",
  message: "Author session A",
  paragraphs: [a, blank],
} as Revision;
const cleanup = {
  ...parent,
  id: "cleanup",
  parentId: "old",
  message: "Removed empty P2",
  paragraphs: [a],
};
it("hides empty-only cleanup while retaining immutable source snapshots", () => {
  expect(isEmptyCleanup(cleanup, parent)).toBe(true);
  expect(historyGroups([parent, cleanup]).flatMap((g) => g.rows)).toEqual([
    parent,
  ]);
  expect(visibleHead([parent, cleanup], cleanup.id)).toBe(parent.id);
  expect(parent.paragraphs).toHaveLength(2);
});
it("never hides removed prose, headings, reordering, renumbering or accompanying edits", () => {
  expect(
    isEmptyCleanup(cleanup, {
      ...parent,
      paragraphs: [a, { ...blank, text: "prose" }],
    }),
  ).toBe(false);
  expect(
    isEmptyCleanup(cleanup, {
      ...parent,
      paragraphs: [a, { ...blank, section: "Scene" }],
    }),
  ).toBe(false);
  expect(
    isEmptyCleanup({ ...cleanup, paragraphs: [{ ...a, text: "New" }] }, parent),
  ).toBe(false);
  expect(isEmptyCleanup({ ...cleanup, edition: 2 }, parent)).toBe(false);
  expect(isEmptyCleanup(cleanup)).toBe(false);
});
it("groups adjacent author recovery snapshots after filtering without merging separate structural events", () => {
  const edit = {
    ...cleanup,
    id: "edit",
    parentId: "cleanup",
    message: parent.message,
    paragraphs: [{ ...a, text: "New" }],
  };
  expect(
    historyGroups([parent, cleanup, edit]).map((g) => g.rows.map((r) => r.id)),
  ).toEqual([["edit", "old"]]);
});
