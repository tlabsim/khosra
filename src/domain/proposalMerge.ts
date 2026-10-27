import type { Paragraph } from "./model";
export type MergeChoice = "current" | "proposal";
export type ProposalResolution = {
  revisionId: string;
  selectedChangeIds?: string[];
  choices: Record<string, MergeChoice>;
};
export type ProposalConflict = {
  id: string;
  label: string;
  kind: "paragraph" | "order";
};
const same = (a?: Paragraph, b?: Paragraph) =>
  a && b ? a.text === b.text && a.section === b.section : a === b;
export function validProposalChoices(
  reviewed: Paragraph[],
  current: Paragraph[],
  choices: Record<string, MergeChoice>,
) {
  const before = new Map(reviewed.map((p) => [p.id, p])),
    after = new Map(current.map((p) => [p.id, p]));
  return Object.fromEntries(
    Object.entries(choices).filter(([id]) =>
      id === "paragraph-order"
        ? reviewed.length === current.length &&
          reviewed.every((p, i) => p.id === current[i].id)
        : same(before.get(id), after.get(id)),
    ),
  );
}
function reordered(
  base: Paragraph[],
  branch: Paragraph[],
  included: Set<string>,
) {
  const branchIds = new Set(branch.map((p) => p.id));
  const baseIds = new Set(base.map((p) => p.id));
  const before = base
    .filter((p) => included.has(p.id) && branchIds.has(p.id))
    .map((p) => p.id);
  const after = branch
    .filter((p) => included.has(p.id) && baseIds.has(p.id))
    .map((p) => p.id);
  return before.some((id, i) => id !== after[i]);
}
function movedIds(base: Paragraph[], branch: Paragraph[]) {
  const oldIds = new Set(base.map((p) => p.id)),
    nextIds = new Set(branch.map((p) => p.id));
  const before = base.filter((p) => nextIds.has(p.id)),
    after = branch.filter((p) => oldIds.has(p.id));
  const moved = new Set<string>();
  before.forEach((p, i) => {
    if (p.id !== after[i].id) {
      moved.add(p.id);
      moved.add(after[i].id);
    }
  });
  return moved;
}
// Keep the primary sequence, placing secondary-only passages at surviving neighbours.
// Content is merged separately, so an explicit order choice never discards prose.
function order(
  primary: Paragraph[],
  secondary: Paragraph[],
  included: Set<string>,
) {
  const ids = primary.filter((p) => included.has(p.id)).map((p) => p.id);
  const present = new Set(ids),
    other = secondary.filter((p) => included.has(p.id)).map((p) => p.id);
  let ambiguous = false;
  for (let i = 0; i < other.length;) {
    if (present.has(other[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < other.length && !present.has(other[i])) i++;
    const chunk = other.slice(start, i);
    const before = other
      .slice(0, start)
      .reverse()
      .find((id) => present.has(id));
    const after = other.slice(i).find((id) => present.has(id));
    if (before && after && ids.indexOf(before) >= ids.indexOf(after))
      ambiguous = true;
    const at = after
      ? ids.indexOf(after)
      : before
        ? ids.indexOf(before) + 1
        : ids.length;
    ids.splice(at, 0, ...chunk);
    chunk.forEach((id) => present.add(id));
  }
  return { ids, ambiguous };
}
export function mergeProposal(
  base: Paragraph[],
  proposed: Paragraph[],
  current: Paragraph[],
  choices: Record<string, MergeChoice> = {},
) {
  const b = new Map(base.map((p) => [p.id, p])),
    p = new Map(proposed.map((p) => [p.id, p])),
    c = new Map(current.map((p) => [p.id, p]));
  const proposalMoves = movedIds(base, proposed),
    currentMoves = movedIds(base, current);
  const merged = new Map<string, Paragraph>(),
    conflicts: ProposalConflict[] = [];
  for (const id of new Set([...b.keys(), ...p.keys(), ...c.keys()])) {
    const before = b.get(id),
      after = p.get(id),
      latest = c.get(id);
    let selected: Paragraph | undefined;
    const moveDeleteConflict =
      !!before &&
      ((!latest && !!after && proposalMoves.has(id)) ||
        (!after && !!latest && currentMoves.has(id)));
    if (!moveDeleteConflict && same(before, after)) selected = latest;
    else if (
      !moveDeleteConflict &&
      (same(before, latest) || same(after, latest))
    )
      selected = after;
    else {
      conflicts.push({
        id,
        label: `P${latest?.label ?? after?.label ?? before!.label}`,
        kind: "paragraph",
      });
      selected = choices[id] === "current" ? latest : after;
    }
    if (selected)
      merged.set(id, { ...selected, label: latest?.label ?? selected.label });
  }
  const included = new Set(merged.keys()),
    pr = reordered(base, proposed, included),
    cr = reordered(base, current, included);
  const shared = new Set(
    proposed.filter((x) => c.has(x.id) && included.has(x.id)).map((x) => x.id),
  );
  const pa = proposed.filter((x) => shared.has(x.id)).map((x) => x.id),
    ca = current.filter((x) => shared.has(x.id)).map((x) => x.id);
  const incompatible = pr && cr && pa.some((id, i) => id !== ca[i]);
  const defaultProposal = pr && !cr;
  const placement = order(
    defaultProposal ? proposed : current,
    defaultProposal ? current : proposed,
    included,
  );
  if (incompatible || placement.ambiguous)
    conflicts.push({
      id: "paragraph-order",
      label: "Paragraph order",
      kind: "order",
    });
  const chosen = choices["paragraph-order"];
  const sequence = chosen
    ? order(
        chosen === "proposal" ? proposed : current,
        chosen === "proposal" ? current : proposed,
        included,
      )
    : placement;
  return {
    paragraphs: sequence.ids.map((id) => merged.get(id)!),
    conflicts,
    unresolved: conflicts.filter((x) => !choices[x.id]),
  };
}
