import { describe, it, expect } from "vitest";
import {
  buildProposalReading,
  type ReadingRow,
} from "../src/domain/proposalReading";
const rows = Array.from({ length: 100 }, (_, i) => ({
  id: `p${i + 1}`,
  label: i + 1,
  text: `Paragraph ${i + 1}`,
  section: "",
}));
const groups = (list: ReadingRow[]) => {
  const result: number[][] = [[]];
  for (const row of list)
    if (row.kind === "gap") result.push([]);
    else result.at(-1)!.push(row.paragraph.label);
  return result.filter((r) => r.length).map((r) => [r[0], r.at(-1)]);
};
describe("continuous proposal reading preview", () => {
  it("matches the requested P43/P45/P65/P90 windows with two separated gaps", () => {
    const after = rows.map((p) =>
      [43, 45, 65, 90].includes(p.label) ? { ...p, text: "Changed" } : p,
    );
    const preview = buildProposalReading(rows, after);
    for (const version of [preview.before, preview.after, preview.combined]) {
      expect(groups(version)).toEqual([
        [38, 50],
        [60, 70],
        [85, 95],
      ]);
      expect(
        version.filter((r) => r.kind === "gap").map((r) => r.count),
      ).toEqual([9, 14]);
      const ids = version.flatMap((r) =>
        r.kind === "paragraph" ? [r.paragraph.id] : [],
      );
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(preview.changed).toBe(4);
  });
  it("keeps one/two skipped paragraphs and omits three, including context boundaries", () => {
    for (const [second, expected] of [
      [23, [[5, 28]]],
      [
        24,
        [
          [5, 15],
          [19, 29],
        ],
      ],
    ] as const) {
      const preview = buildProposalReading(
        rows,
        rows.map((p) =>
          p.label === 10 || p.label === second ? { ...p, text: "Changed" } : p,
        ),
      );
      expect(groups(preview.after)).toEqual(expected);
    }
    expect(
      groups(
        buildProposalReading(
          rows,
          rows.map((p) =>
            [1, 100].includes(p.label) ? { ...p, text: "Changed" } : p,
          ),
        ).after,
      ),
    ).toEqual([
      [1, 6],
      [95, 100],
    ]);
  });
  it("strikes removed paragraphs only in Before and keeps five survivors around a long removal in After", () => {
    const after = rows.filter((p) => p.label < 43 || p.label > 65);
    const preview = buildProposalReading(rows, after);
    expect(preview.removed).toBe(23);
    expect(preview.changed).toBe(0);
    expect(groups(preview.before)).toEqual([[38, 70]]);
    expect(groups(preview.after)).toEqual([[38, 70]]);
    expect(
      preview.before.filter(
        (r) => r.kind === "paragraph" && r.change === "removed",
      ),
    ).toHaveLength(23);
    expect(
      preview.after
        .filter((r) => r.kind === "paragraph")
        .map((r) => r.paragraph.label),
    ).toEqual([38, 39, 40, 41, 42, 66, 67, 68, 69, 70]);
  });
  it("inserts new prose in the right place, keeps stable labels, and anchors its Before context", () => {
    const inserted = {
      id: "new",
      label: 101,
      text: "A new scene",
      section: "New heading",
    };
    const preview = buildProposalReading(rows, [
      ...rows.slice(0, 50),
      inserted,
      ...rows.slice(50),
    ]);
    expect(preview.added).toBe(1);
    expect(preview.removed).toBe(0);
    expect(groups(preview.before)).toEqual([[46, 55]]);
    const paragraphs = preview.after.flatMap((r) =>
      r.kind === "paragraph" ? [r.paragraph] : [],
    );
    expect(paragraphs.map((p) => p.label)).toEqual([
      46, 47, 48, 49, 50, 101, 51, 52, 53, 54, 55,
    ]);
    expect(paragraphs[5]).toEqual(inserted);
  });
  it("handles heading edits, moves, all-deleted/added/replaced chapters and no-op previews without mutating inputs", () => {
    const before = structuredClone(rows);
    const next = rows.map((p) =>
      p.label === 1 ? { ...p, section: "Scene" } : p,
    );
    [next[49], next[50]] = [next[50], next[49]];
    const preview = buildProposalReading(rows, next);
    expect(preview.changed).toBe(3);
    expect(buildProposalReading(rows, []).after).toEqual([]);
    expect(buildProposalReading([], rows).before).toEqual([]);
    expect(buildProposalReading(rows, rows)).toMatchObject({
      before: [],
      after: [],
      added: 0,
      removed: 0,
      changed: 0,
    });
    const replacement = buildProposalReading(rows, [
      { id: "other", label: 101, text: "Replacement", section: "" },
    ]);
    expect(replacement.before).toHaveLength(100);
    expect(replacement.after).toHaveLength(1);
    expect(replacement).toMatchObject({ removed: 100, added: 1 });
    expect(rows).toEqual(before);
  });
});

it("weaves deleted passages into the proposed order and retains exact prior text for modified paragraphs", () => {
  const before = rows.slice(0, 20);
  const added = { id: "new", label: 101, text: "New scene", section: "" };
  const after = before
    .filter((p) => ![8, 9].includes(p.label))
    .map((p) => (p.label === 7 ? { ...p, text: "Revised seventh" } : p));
  after.splice(7, 0, added);
  const preview = buildProposalReading(before, after);
  const combined = preview.combined.flatMap((r) =>
    r.kind === "paragraph" ? [r] : [],
  );
  expect(
    combined
      .filter((r) => r.change === "removed")
      .map((r) => r.paragraph.label),
  ).toEqual([8, 9]);
  expect(combined.find((r) => r.paragraph.label === 7)?.previous?.text).toBe(
    "Paragraph 7",
  );
  expect(combined.find((r) => r.paragraph.label === 7)?.paragraph.text).toBe(
    "Revised seventh",
  );
  const live = combined
    .filter((r) => r.change !== "removed")
    .map((r) => r.paragraph);
  const ids = new Set(live.map((p) => p.id));
  expect(live).toEqual(after.filter((p) => ids.has(p.id)));
  expect(new Set(combined.map((r) => r.paragraph.id)).size).toBe(
    combined.length,
  );
});
it("handles complete replacement and hiding all deleted paragraphs without recreating the original source", () => {
  const after = [
    { id: "new", label: 101, text: "A shorter replacement", section: "" },
  ];
  const preview = buildProposalReading(rows, after);
  const visible = preview.combined.filter(
    (r) => r.kind !== "paragraph" || r.change !== "removed",
  );
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({
    kind: "paragraph",
    paragraph: after[0],
    change: "added",
  });
  const deleted = buildProposalReading(rows, []);
  expect(
    deleted.combined.every(
      (r) => r.kind === "paragraph" && r.change === "removed",
    ),
  ).toBe(true);
});
