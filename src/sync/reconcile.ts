import { applyMaterialDeletions } from "../domain/materials";
import {
  ProposalSchema,
  ChapterProposalSchema,
  validateState,
  type State,
  type Chapter,
} from "../domain/model";
export type Choices = Record<string, "local" | "server">;
export type Conflict = {
  id: string;
  kind: "book" | "chapter";
  title: string;
  local: string;
  server: string;
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function union<T extends { id: string }>(
  local: T[],
  remote: T[],
  merge?: (a: T, b: T) => T,
): T[] {
  const map = new Map(remote.map((x) => [x.id, x]));
  for (const a of local) {
    const b = map.get(a.id);
    if (!b) map.set(a.id, a);
    else if (merge) map.set(a.id, merge(a, b));
    else if (!equal(a, b))
      throw Error(
        "A historical record has conflicting content. Keep both archives and investigate before merging.",
      );
  }
  return [...map.values()];
}
export function reconcile(local: State, remote: State, choices: Choices = {}) {
  validateState(local);
  validateState(remote);
  const conflicts: Conflict[] = [];
  const revisions = union(local.revisions, remote.revisions);
  const ancestor = (id: string, target: string) => {
    const seen = new Set<string>();
    let next: string | null = target;
    while (next && !seen.has(next)) {
      if (next === id) return true;
      seen.add(next);
      next = revisions.find((r) => r.id === next)?.parentId || null;
    }
    return false;
  };
  const books = union(local.books, remote.books, (a, b) => {
    if (equal(a, b)) return a;
    if (!choices[a.id])
      conflicts.push({
        id: a.id,
        kind: "book",
        title: a.title,
        local: a.premise,
        server: b.premise,
      });
    return choices[a.id] === "local" ? a : b;
  });
  const chapters = union(local.chapters, remote.chapters, (a, b) => {
    const metadata = (c: Chapter) => ({
      bookId: c.bookId,
      code: c.code,
      title: c.title,
      position: c.position,
      synopsis: c.synopsis,
      approvedId: c.approvedId,
      deletedAt: c.deletedAt ?? null,
    });
    if (a.headId === b.headId && equal(metadata(a), metadata(b))) return a;
    const divergence =
      !ancestor(a.headId, b.headId) && !ancestor(b.headId, a.headId);
    if (divergence || !equal(metadata(a), metadata(b))) {
      if (!choices[a.id])
        conflicts.push({
          id: a.id,
          kind: "chapter",
          title: a.title,
          local:
            (a.deletedAt ? "In Trash\n\n" : "In manuscript\n\n") +
            revisions
              .find((r) => r.id === a.headId)!
              .paragraphs.map((p) => p.text)
              .join("\n\n"),
          server:
            (b.deletedAt ? "In Trash\n\n" : "In manuscript\n\n") +
            revisions
              .find((r) => r.id === b.headId)!
              .paragraphs.map((p) => p.text)
              .join("\n\n"),
        });
      return choices[a.id] === "local" ? a : b;
    }
    return ancestor(a.headId, b.headId) ? b : a;
  });
  // Completed server review decisions are authoritative; unsynced terminal decisions
  // can advance pending server proposals. Proposal content remains immutable.
  const proposals = union(local.proposals, remote.proposals, (a, b) => {
    const strip = (p: typeof a) => ({
      ...ProposalSchema.parse(p),
      status: "pending",
      review: undefined,
    });
    if (!equal(strip(a), strip(b)))
      throw Error("Proposal content differs between copies.");
    return b.status === "pending" ? a : b;
  });
  const flags = union(local.flags, remote.flags, (a, b) => {
    if (!equal({ ...a, status: "open" }, { ...b, status: "open" }))
      throw Error("Flag content differs between copies.");
    return a;
  });
  const state = validateState(
    applyMaterialDeletions({
      schemaVersion: 1,
      books,
      chapters,
      revisions,
      flags,
      proposals,
      chapterProposals: union(
        local.chapterProposals ?? [],
        remote.chapterProposals ?? [],
        (a, b) => {
          const strip = (p: typeof a) => ({
            ...ChapterProposalSchema.parse(p),
            status: "pending",
            review: undefined,
          });
          if (!equal(strip(a), strip(b)))
            throw Error("New-chapter proposal content differs between copies.");
          if (a.status !== "pending" && b.status !== "pending" && !equal(a, b))
            throw Error(
              "This chapter proposal was reviewed differently on another device. Keep both backups and review the server copy.",
            );
          return b.status === "pending" ? a : b;
        },
      ),
      contexts: union(local.contexts, remote.contexts),
      materials: union(local.materials ?? [], remote.materials ?? []),
      files: union(local.files ?? [], remote.files ?? []),
      materialDeletions: union(
        local.materialDeletions ?? [],
        remote.materialDeletions ?? [],
      ),
    }),
  );
  return { state, conflicts };
}
