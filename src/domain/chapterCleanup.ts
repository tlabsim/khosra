import { type State, uid, now, validateState } from "./model";

// Apply only to explicitly recorded IDs. New/unsynced material is never swept up.
export function applyChapterCleanups(s: State): State {
  const targets = (key: "proposalIds" | "contextIds" | "chapterProposalIds") =>
    new Set(s.chapterCleanups.flatMap((c) => c[key]));
  const proposals = targets("proposalIds"),
    contexts = targets("contextIds"),
    chapters = targets("chapterProposalIds");
  // A pending copy can be older than the terminal decision cleaned on another device.
  return {
    ...s,
    proposals: s.proposals.filter((p) => !proposals.has(p.id)),
    contexts: s.contexts.filter((p) => !contexts.has(p.id)),
    chapterProposals: s.chapterProposals.filter((p) => !chapters.has(p.id)),
  };
}
export const workspaceBytes = (s: State) =>
  new TextEncoder().encode(JSON.stringify(s)).byteLength;

export function chapterCleanupPlan(s: State, chapterId: string) {
  const chapter = s.chapters.find((c) => c.id === chapterId);
  if (!chapter || chapter.deletedAt)
    throw Error("Open an active chapter to clean up.");
  const contexts = s.contexts.filter((c) => c.chapterId === chapterId);
  return {
    proposalIds: s.proposals
      .filter((p) => p.chapterId === chapterId && p.status !== "pending")
      .map((p) => p.id),
    contextIds: contexts.slice(0, -1).map((c) => c.id),
    chapterProposalIds: s.chapterProposals
      .filter(
        (p) => p.status === "accepted" && p.review?.chapterId === chapterId,
      )
      .map((p) => p.id),
  };
}
export function cleanChapter(s: State, chapterId: string): State {
  const plan = chapterCleanupPlan(s, chapterId);
  if (!Object.values(plan).some((ids) => ids.length)) return s;
  return validateState(
    applyChapterCleanups({
      ...s,
      chapterCleanups: [
        ...s.chapterCleanups,
        { id: uid(), chapterId, createdAt: now(), ...plan },
      ],
    }),
  );
}
