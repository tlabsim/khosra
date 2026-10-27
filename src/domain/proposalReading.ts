import type { Paragraph } from "./model";
import { changedParagraphIds } from "./proposalComparison";
export type ReadingRow =
  | {
      kind: "paragraph";
      paragraph: Paragraph;
      previous?: Paragraph;
      change: "unchanged" | "changed" | "added" | "removed";
    }
  | { kind: "gap"; count: number };
export type ProposalReading = {
  combined: ReadingRow[];
  before: ReadingRow[];
  after: ReadingRow[];
  added: number;
  removed: number;
  changed: number;
};

function readingRows(
  rows: Paragraph[],
  other: Paragraph[],
  changed: Set<string>,
  version: "before" | "after",
): ReadingRow[] {
  const positions = new Map(rows.map((p, i) => [p.id, i]));
  const windows: { start: number; end: number }[] = [];
  rows.forEach((p, i) => {
    if (changed.has(p.id))
      windows.push({
        start: Math.max(0, i - 5),
        end: Math.min(rows.length - 1, i + 5),
      });
  });
  // Missing paragraphs still need context at their insertion/deletion boundary.
  // Precompute the next surviving neighbour to avoid repeatedly scanning long
  // runs of deleted text (large chapter condensations are a common workflow).
  const nextPositions: (number | undefined)[] = new Array(other.length);
  let next: number | undefined;
  for (let i = other.length - 1; i >= 0; i--) {
    nextPositions[i] = next;
    if (positions.has(other[i].id)) next = positions.get(other[i].id);
  }
  let previous: number | undefined;
  other.forEach((p, i) => {
    const position = positions.get(p.id);
    if (position !== undefined) previous = position;
    else if (changed.has(p.id) && rows.length) {
      const gap =
        nextPositions[i] ?? (previous === undefined ? 0 : previous + 1);
      windows.push({
        start: Math.max(0, gap - 5),
        end: Math.min(rows.length - 1, gap + 4),
      });
    }
  });
  const merged: { start: number; end: number }[] = [];
  for (const range of windows.sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    const last = merged.at(-1);
    // Two or fewer omitted paragraphs are kept, rather than a tiny ellipsis.
    if (last && range.start - last.end - 1 <= 2)
      last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const otherIds = new Set(other.map((p) => p.id));
  const output: ReadingRow[] = [];
  merged.forEach((range, i) => {
    if (i)
      output.push({ kind: "gap", count: range.start - merged[i - 1].end - 1 });
    for (const paragraph of rows.slice(range.start, range.end + 1))
      output.push({
        kind: "paragraph",
        paragraph,
        change: !otherIds.has(paragraph.id)
          ? version === "before"
            ? "removed"
            : "added"
          : changed.has(paragraph.id)
            ? "changed"
            : "unchanged",
      });
  });
  return output;
}

// Keep the proposed reading order, placing each removed run immediately before
// its next surviving original neighbour. These rows are annotations only: hiding
// removals always yields the proposed sequence exactly.
export function withRemoved(
  before: Paragraph[],
  after: Paragraph[],
): Paragraph[] {
  const afterIds = new Set(after.map((p) => p.id));
  if (!before.some((p) => afterIds.has(p.id))) return [...before, ...after];
  const ahead = new Map<string, Paragraph[]>();
  let removed: Paragraph[] = [];
  for (const paragraph of before) {
    if (afterIds.has(paragraph.id)) {
      if (removed.length) ahead.set(paragraph.id, removed);
      removed = [];
    } else removed.push(paragraph);
  }
  return [...after.flatMap((p) => [...(ahead.get(p.id) ?? []), p]), ...removed];
}

// Called only by the explicit preview action. Stores affected windows, never a
// second full rendered manuscript, and never writes to the workspace.
export function buildProposalReading(
  before: Paragraph[],
  after: Paragraph[],
  forcedChanges: Set<string> = new Set(),
): ProposalReading {
  const changed = changedParagraphIds(before, after);
  for (const id of forcedChanges) changed.add(id);
  const oldIds = new Set(before.map((p) => p.id)),
    nextIds = new Set(after.map((p) => p.id));
  const old = new Map(before.map((p) => [p.id, p]));
  const combined = readingRows(
    withRemoved(before, after),
    [],
    changed,
    "after",
  ).map((row): ReadingRow => {
    if (row.kind === "gap") return row;
    const p = row.paragraph;
    return {
      kind: "paragraph",
      paragraph: p,
      previous: old.get(p.id),
      change: !nextIds.has(p.id)
        ? "removed"
        : !oldIds.has(p.id)
          ? "added"
          : changed.has(p.id)
            ? "changed"
            : "unchanged",
    };
  });
  return {
    combined,
    before: readingRows(before, after, changed, "before"),
    after: readingRows(after, before, changed, "after"),
    removed: before.filter((p) => !nextIds.has(p.id)).length,
    added: after.filter((p) => !oldIds.has(p.id)).length,
    changed: after.filter((p) => oldIds.has(p.id) && changed.has(p.id)).length,
  };
}
