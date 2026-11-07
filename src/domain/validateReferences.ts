import type { Proposal, Revision } from "./model";

/** Walk each edition's revision tree with one reversible index, rather than
 * retaining two complete paragraph maps for every historical snapshot. */
export function validateReferences(
  revisions: Revision[],
  proposals: Proposal[],
) {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const verified = new Set<string>();
  for (const revision of revisions) {
    const path = new Set<string>();
    let r: Revision | undefined = revision;
    while (r && !verified.has(r.id)) {
      if (path.has(r.id)) throw Error("Cyclic revision history.");
      path.add(r.id);
      r = byId.get(r.parentId || "");
    }
    for (const id of path) verified.add(id);
  }
  const children = new Map<string, Revision[]>(),
    roots: Revision[] = [];
  for (const r of revisions) {
    const parent = byId.get(r.parentId || "");
    if (!parent || parent.edition !== r.edition) roots.push(r);
    else {
      const list = children.get(parent.id) || [];
      list.push(r);
      children.set(parent.id, list);
    }
  }
  const pending = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const list = pending.get(p.baseRevisionId) || [];
    list.push(p);
    pending.set(p.baseRevisionId, list);
  }
  for (const root of roots) {
    const addresses = new Map<number, string>(),
      identities = new Map<string, number>();
    type Frame = { revision: Revision; undo?: { label: number; id: string }[] };
    const stack: Frame[] = [{ revision: root }];
    const conflict = (p: Revision["paragraphs"][number]) =>
      (addresses.has(p.label) && addresses.get(p.label) !== p.id) ||
      (identities.has(p.id) && identities.get(p.id) !== p.label);
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.undo) {
        for (const p of frame.undo) {
          addresses.delete(p.label);
          identities.delete(p.id);
        }
        continue;
      }
      const r = frame.revision,
        undo: NonNullable<Frame["undo"]> = [];
      for (const p of r.paragraphs) {
        if (conflict(p))
          throw Error(
            "Historical paragraph references cannot be reassigned within an edition. Preserve source UUIDs and numbers; current numbering is automatic.",
          );
        if (!addresses.has(p.label)) {
          addresses.set(p.label, p.id);
          identities.set(p.id, p.label);
          undo.push({ label: p.label, id: p.id });
        }
      }
      for (const p of pending.get(r.id) || []) {
        for (const blocks of [p.paragraphs, p.review?.paragraphs || []])
          for (const block of blocks)
            if (conflict(block))
              throw Error("Proposal changes stable paragraph references.");
      }
      stack.push({ revision: r, undo });
      for (const child of children.get(r.id) || [])
        stack.push({ revision: child });
    }
  }
}
