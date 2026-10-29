import { z } from "zod";
import type { State } from "./model";

export const ChapterCleanupSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  createdAt: z.string().datetime(),
  proposalIds: z.array(z.string().uuid()).max(100000),
  contextIds: z.array(z.string().uuid()).max(100000),
  chapterProposalIds: z.array(z.string().uuid()).max(100000),
});
export type ChapterCleanup = z.infer<typeof ChapterCleanupSchema>;
const collections = [
  ["proposals", "proposalIds"],
  ["contexts", "contextIds"],
  ["chapterProposals", "chapterProposalIds"],
] as const;

export function validateChapterCleanups(s: State) {
  const owners = new Map<string, string>();
  const chapters = new Set(s.chapters.map((c) => c.id));
  const present = {
    proposals: new Set(s.proposals.map((r) => r.id)),
    contexts: new Set(s.contexts.map((r) => r.id)),
    chapterProposals: new Set(s.chapterProposals.map((r) => r.id)),
  };
  for (const cleanup of s.chapterCleanups) {
    if (!chapters.has(cleanup.chapterId))
      throw Error("Cleanup chapter is missing.");
    for (const [key, ids] of collections) {
      if (new Set(cleanup[ids]).size !== cleanup[ids].length)
        throw Error("Duplicate cleanup target.");
      for (const id of cleanup[ids]) {
        const address = `${key}:${id}`;
        if (owners.has(address) && owners.get(address) !== cleanup.chapterId)
          throw Error("Cleanup target belongs to another chapter.");
        owners.set(address, cleanup.chapterId);
        if (present[key].has(id))
          throw Error(
            "Cleaned records cannot be restored by an older workspace.",
          );
      }
    }
  }
}
