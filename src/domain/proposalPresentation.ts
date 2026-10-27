import type { Proposal, Revision } from "./model";

export function newestProposals(proposals: Proposal[]): Proposal[] {
  return proposals
    .map((proposal, index) => ({ proposal, index }))
    .sort((a, b) => {
      const time = (value: string) => Date.parse(value) || 0;
      return (
        time(b.proposal.createdAt) - time(a.proposal.createdAt) ||
        b.index - a.index
      );
    })
    .map(({ proposal }) => proposal);
}

// The most recent content-changing ancestor owns the visible paragraph. Metadata
// changes and edits elsewhere preserve attribution; branches outside this lineage
// and unchanged paragraphs in full-chapter proposals never acquire it.
export function acceptedProposalParagraphs(
  revisions: Revision[],
  displayed?: Revision,
): Set<string> {
  const marked = new Set<string>();
  if (!displayed) return marked;
  const byId = new Map(
    revisions
      .filter((r) => r.chapterId === displayed.chapterId)
      .map((r) => [r.id, r]),
  );
  const unresolved = new Set(displayed.paragraphs.map((p) => p.id));
  const visited = new Set<string>();
  let revision: Revision | undefined = displayed;
  while (revision && unresolved.size && !visited.has(revision.id)) {
    visited.add(revision.id);
    const parent = byId.get(revision.parentId ?? "");
    if (!parent) break;
    const before = new Map(parent.paragraphs.map((p) => [p.id, p]));
    for (const p of revision.paragraphs) {
      if (!unresolved.has(p.id)) continue;
      const old = before.get(p.id);
      if (!old || old.text !== p.text || old.section !== p.section) {
        if (revision.source === "proposal") marked.add(p.id);
        unresolved.delete(p.id);
      }
    }
    revision = parent;
  }
  return marked;
}
