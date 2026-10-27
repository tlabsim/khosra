import { describe, expect, it } from "vitest";
import {
  changedParagraphIds,
  comparisonRanges,
} from "../src/domain/proposalComparison";
const rows = Array.from({ length: 20 }, (_, i) => ({
  id: `id-${i}`,
  label: i + 1,
  section: "",
  text: `Paragraph ${i + 1}`,
}));
describe("proposal comparison ranges", () => {
  it("keeps separated edits focused with at most five neighbouring paragraphs", () => {
    const next = rows.map((p, i) =>
      i === 6 || i === 16 ? { ...p, text: "Changed" } : p,
    );
    const ranges = comparisonRanges(next, changedParagraphIds(rows, next), [
      rows,
      next,
    ]);
    expect(ranges.map((r) => r.paragraphs.map((p) => p.label))).toEqual([
      [7],
      [17],
    ]);
    expect(ranges[0].earlier.map((p) => p.label)).toEqual([2, 3, 4, 5, 6]);
    expect(ranges[0].later.map((p) => p.label)).toEqual([8, 9, 10, 11, 12]);
    expect(ranges[1].later.map((p) => p.label)).toEqual([18, 19, 20]);
  });
  it("shows deleted text in Before and an empty anchored range in After", () => {
    const next = rows.filter((p) => p.label !== 10);
    const ids = changedParagraphIds(rows, next);
    expect(
      comparisonRanges(rows, ids, [rows, next])[0].paragraphs.map(
        (p) => p.label,
      ),
    ).toEqual([10]);
    const after = comparisonRanges(next, ids, [rows, next])[0];
    expect(after.paragraphs).toEqual([]);
    expect(after.earlier.at(-1)?.label).toBe(9);
    expect(after.later[0].label).toBe(11);
  });
  it("anchors inserted text in Before without treating following text as changed", () => {
    const next = [
      ...rows.slice(0, 5),
      { id: "added", label: 21, section: "", text: "New" },
      ...rows.slice(5),
    ];
    const ids = changedParagraphIds(rows, next);
    expect([...ids]).toEqual(["added"]);
    expect(comparisonRanges(rows, ids, [rows, next])[0].paragraphs).toEqual([]);
    expect(
      comparisonRanges(next, ids, [rows, next])[0].paragraphs[0].text,
    ).toBe("New");
  });
  it("includes subsection changes and moved paragraphs", () => {
    const next = rows.map((p) =>
      p.label === 4 ? { ...p, section: "New heading" } : p,
    );
    [next[9], next[10]] = [next[10], next[9]];
    expect([...changedParagraphIds(rows, next)].sort()).toEqual([
      "id-10",
      "id-3",
      "id-9",
    ]);
  });
  it("handles unchanged, empty and completely replaced versions", () => {
    expect(
      comparisonRanges(rows, changedParagraphIds(rows, rows), [rows]),
    ).toEqual([]);
    const ids = changedParagraphIds(rows, []);
    expect(comparisonRanges([], ids, [rows])[0].paragraphs).toEqual([]);
    const replacement = [
      { id: "replacement", label: 1, text: "Other", section: "" },
    ];
    expect(comparisonRanges(replacement, ids, [rows])[0].later).toEqual(
      replacement,
    );
  });
});
