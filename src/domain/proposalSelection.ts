import type { Paragraph } from "./model";
import { changedParagraphIds } from "./proposalComparison";
export type ProposalChange = {
  id: string;
  paragraphIds: string[];
  linked: boolean;
};

// An unchanged anchor separates independent edits. A structural replacement
// (including a split/join) is indivisible; reordered proposals are one group.
export function proposalChanges(
  before: Paragraph[],
  after: Paragraph[],
): ProposalChange[] {
  const changed = changedParagraphIds(before, after);
  const old = new Set(before.map((p) => p.id)),
    next = new Set(after.map((p) => p.id));
  const a = before.filter((p) => next.has(p.id)),
    b = after.filter((p) => old.has(p.id));
  if (a.some((p, i) => p.id !== b[i].id)) {
    const ids = [...changed];
    return ids.length ? [{ id: ids[0], paragraphIds: ids, linked: true }] : [];
  }
  const beforeAt = new Map(before.map((p, i) => [p.id, i])),
    afterAt = new Map(after.map((p, i) => [p.id, i]));
  const anchors = after.filter((p) => !changed.has(p.id));
  const groups: ProposalChange[] = [];
  let bi = 0,
    ai = 0;
  for (const anchor of [...anchors, undefined]) {
    const endB = anchor ? beforeAt.get(anchor.id)! : before.length;
    const endA = anchor ? afterAt.get(anchor.id)! : after.length;
    const left = before.slice(bi, endB),
      right = after.slice(ai, endA);
    const ids = [...new Set([...left, ...right].map((p) => p.id))];
    const structural =
      left.some((p) => !next.has(p.id)) || right.some((p) => !old.has(p.id));
    if (structural && ids.length)
      groups.push({ id: ids[0], paragraphIds: ids, linked: ids.length > 1 });
    else
      for (const id of ids)
        groups.push({ id, paragraphIds: [id], linked: false });
    bi = endB + 1;
    ai = endA + 1;
  }
  return groups;
}

export function selectProposalChanges(
  before: Paragraph[],
  after: Paragraph[],
  selectedIds: string[],
) {
  const groups = proposalChanges(before, after),
    selected = new Set(selectedIds);
  const all = new Set(groups.flatMap((g) => g.paragraphIds));
  if (
    selected.size !== selectedIds.length ||
    selectedIds.some((id) => !all.has(id))
  )
    throw Error("Invalid proposal selection.");
  for (const group of groups) {
    const count = group.paragraphIds.filter((id) => selected.has(id)).length;
    if (count && count !== group.paragraphIds.length)
      throw Error("Linked paragraph changes must be reviewed together.");
  }
  const old = new Map(before.map((p) => [p.id, p]));
  const rejected = new Set([...all].filter((id) => !selected.has(id)));
  // All-or-nothing reordered proposals never combine two incompatible orders.
  if (groups.length === 1 && groups[0].linked && !selected.size) return before;
  const rows = after.flatMap((p) =>
    rejected.has(p.id) ? (old.has(p.id) ? [old.get(p.id)!] : []) : [p],
  );
  const present = new Set(rows.map((p) => p.id));
  // Put declined deletions back at their original surviving neighbours.
  const ahead = new Map<string, Paragraph[]>();
  let missing: Paragraph[] = [];
  for (const p of before) {
    if (present.has(p.id)) {
      if (missing.length) ahead.set(p.id, missing);
      missing = [];
    } else if (rejected.has(p.id)) missing.push(p);
  }
  return [...rows.flatMap((p) => [...(ahead.get(p.id) ?? []), p]), ...missing];
}
