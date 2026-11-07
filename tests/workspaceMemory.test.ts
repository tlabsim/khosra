import { expect, it } from "vitest";
import { compactHistory } from "../src/domain/compactHistory";
import { validateReferences } from "../src/domain/validateReferences";
import { equalValue } from "../src/domain/equal";
import {
  emptyState,
  uid,
  type Paragraph,
  type Revision,
  type Proposal,
} from "../src/domain/model";
import { SnapshotWriter } from "../src/storage/snapshotWriter";
const block = (label = 1): Paragraph => ({
  id: uid(),
  label,
  text: "বাংলা সংলাপ।",
  section: "",
});
const revision = (
  paragraphs: Paragraph[],
  parent?: Revision,
  edition = 1,
): Revision => ({
  id: uid(),
  chapterId: parent?.chapterId || uid(),
  parentId: parent?.id || null,
  edition,
  paragraphs,
  source: "author",
  message: "Test",
  createdAt: new Date().toISOString(),
});
it("shares only exactly equal immutable history blocks and keeps archive contents identical", () => {
  const a = block(),
    root = revision([a]),
    next = revision([{ ...a }], root),
    edited = revision([{ ...a, text: "Changed" }], next);
  const numbered = revision([{ ...a, label: 2 }], edited, 2),
    section = revision([{ ...a, section: "Scene" }], numbered, 3);
  const s = {
    ...emptyState(),
    revisions: [root, next, edited, numbered, section],
  };
  const json = JSON.stringify(s),
    compact = compactHistory(s);
  expect(JSON.stringify(compact)).toBe(json);
  expect(compact.revisions[0].paragraphs[0]).toBe(
    compact.revisions[1].paragraphs[0],
  );
  for (let i = 2; i < 5; i++)
    expect(compact.revisions[i].paragraphs[0]).not.toBe(
      compact.revisions[0].paragraphs[0],
    );
  expect(() => {
    compact.revisions[1].paragraphs[0].text = "Overwrite";
  }).toThrow();
  expect(compact.revisions[0].paragraphs[0].text).toBe(a.text);
});
it("checks deleted address reservations and proposals against their exact branch", () => {
  const a = block(),
    root = revision([a]),
    leftBlock = block(2),
    rightBlock = block(2);
  const left = revision([a, leftBlock], root),
    right = revision([a, rightBlock], root),
    removed = revision([a], left);
  expect(() =>
    validateReferences([right, removed, root, left], []),
  ).not.toThrow();
  expect(() =>
    validateReferences(
      [root, left, removed, revision([a, rightBlock], removed)],
      [],
    ),
  ).toThrow(/Historical/);
  const p = {
    baseRevisionId: left.id,
    paragraphs: [a, rightBlock],
  } as Proposal;
  expect(() => validateReferences([root, left, right], [p])).toThrow(
    /Proposal/,
  );
  expect(() =>
    validateReferences(
      [root, left, right],
      [{ ...p, baseRevisionId: root.id }],
    ),
  ).not.toThrow();
});
it("validates deep history iteratively and rejects cycles across numbering editions", () => {
  const a = block(),
    rows: Revision[] = [];
  for (let i = 0; i < 15000; i++) rows.push(revision([a], rows.at(-1)));
  expect(() => validateReferences([...rows].reverse(), [])).not.toThrow();
  const first = revision([a]),
    second = revision([{ ...a, label: 2 }], first, 2);
  first.parentId = second.id;
  expect(() => validateReferences([first, second], [])).toThrow(/Cyclic/);
});
it("compares JSON state without large serialized copies, including optional undefined fields", () => {
  expect(
    equalValue(
      { a: ["বাংলা", { x: 1 }], unused: undefined },
      { a: ["বাংলা", { x: 1 }] },
    ),
  ).toBe(true);
  expect(equalValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(equalValue({ a: null }, { a: {} })).toBe(false);
  expect(equalValue({ a: "old" }, { a: "new" })).toBe(false);
});
it("coalesces waiting snapshots while preserving every revision and all completion promises", async () => {
  const writes: { revisions: number[] }[] = [],
    gates: (() => void)[] = [];
  const writer = new SnapshotWriter<{ revisions: number[] }>(async (s) => {
    writes.push(s);
    await new Promise<void>((resolve) => gates.push(resolve));
  });
  const pending: Promise<void>[] = [];
  for (let i = 0; i < 40; i++)
    pending.push(
      writer.enqueue({ revisions: Array.from({ length: i + 1 }, (_, j) => j) }),
    );
  expect(writes).toHaveLength(1);
  gates.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(writes).toHaveLength(2);
  expect(writes[1].revisions).toHaveLength(40);
  gates.shift()!();
  await Promise.all(pending);
});
it("propagates persistence failure and can save a later recovery snapshot", async () => {
  let fail = true;
  const writer = new SnapshotWriter<number>(async () => {
    if (fail) throw Error("Quota");
  });
  await expect(writer.enqueue(1)).rejects.toThrow("Quota");
  fail = false;
  await expect(writer.enqueue(2)).resolves.toBeUndefined();
});
