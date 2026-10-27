import type { Paragraph } from "./model";

export function changedParagraphIds(before: Paragraph[], after: Paragraph[]) {
  const old = new Map(before.map((p) => [p.id, p]));
  const next = new Map(after.map((p) => [p.id, p]));
  const changed = new Set<string>();
  for (const p of after) {
    const previous = old.get(p.id);
    if (
      !previous ||
      previous.text !== p.text ||
      previous.section !== p.section ||
      previous.label !== p.label
    )
      changed.add(p.id);
  }
  for (const p of before) if (!next.has(p.id)) changed.add(p.id);
  const a = before.filter((p) => next.has(p.id));
  const b = after.filter((p) => old.has(p.id));
  a.forEach((p, i) => {
    if (p.id !== b[i].id) {
      changed.add(p.id);
      changed.add(b[i].id);
    }
  });
  return changed;
}

export function comparisonRanges(
  rows: Paragraph[],
  changed: Set<string>,
  sources: Paragraph[][],
) {
  const positions = new Map(rows.map((p, i) => [p.id, i]));
  const ranges = rows.flatMap((p, i) =>
    changed.has(p.id) ? [{ start: i, end: i }] : [],
  );
  // A deleted or newly added paragraph may be absent from this version. Anchor
  // its empty range between surviving neighbours, without inventing prose.
  for (const id of changed) {
    if (positions.has(id)) continue;
    const source = sources.find((list) => list.some((p) => p.id === id));
    if (!source) continue;
    const index = source.findIndex((p) => p.id === id);
    const following = source.slice(index + 1).find((p) => positions.has(p.id));
    const preceding = source
      .slice(0, index)
      .reverse()
      .find((p) => positions.has(p.id));
    const gap = following
      ? positions.get(following.id)!
      : preceding
        ? positions.get(preceding.id)! + 1
        : 0;
    ranges.push({ start: gap, end: gap - 1 });
  }
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges.sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    const last = merged.at(-1);
    if (last && range.start <= last.end + 1)
      last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged.map((range, i) => ({
    paragraphs: rows.slice(range.start, range.end + 1),
    earlier: rows.slice(
      Math.max((merged[i - 1]?.end ?? -1) + 1, range.start - 5),
      range.start,
    ),
    later: rows.slice(
      range.end + 1,
      Math.min(merged[i + 1]?.start ?? rows.length, range.end + 6),
    ),
  }));
}
