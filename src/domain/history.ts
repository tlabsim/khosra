import type { Revision } from "./model";

export function isEmptyCleanup(revision: Revision, parent?: Revision): boolean {
  if (
    !parent ||
    revision.source !== "author" ||
    revision.edition !== parent.edition
  )
    return false;
  const remaining = new Map(revision.paragraphs.map((p) => [p.id, p]));
  const removed = parent.paragraphs.filter((p) => !remaining.has(p.id));
  if (!removed.length || removed.some((p) => p.text.trim() || p.section.trim()))
    return false;
  const kept = parent.paragraphs.filter((p) => remaining.has(p.id));
  return (
    kept.length === revision.paragraphs.length &&
    kept.every((p, i) => {
      const next = revision.paragraphs[i];
      return (
        p.id === next.id &&
        p.label === next.label &&
        p.text === next.text &&
        p.section === next.section
      );
    })
  );
}
export function historyGroups(revisions: Revision[]) {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const groups: { key: string; rows: Revision[] }[] = [];
  for (const r of [...revisions].reverse()) {
    if (isEmptyCleanup(r, byId.get(r.parentId || ""))) continue;
    const key = r.message.startsWith("Author session ") ? r.message : r.id;
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  return groups;
}
export function historyTitle(r: Revision) {
  return r.message.startsWith("Author session ")
    ? "Author editing session"
    : r.message;
}
export function visibleHead(revisions: Revision[], id: string) {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  let r = byId.get(id);
  while (r && isEmptyCleanup(r, byId.get(r.parentId || "")))
    r = byId.get(r.parentId || "");
  return r?.id || id;
}
