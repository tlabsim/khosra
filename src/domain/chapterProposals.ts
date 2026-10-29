import {
  now,
  validateState,
  type ChapterProposal,
  type State,
  type Paragraph,
} from "./model";
import { manuscriptChapters } from "./chapters";

export type ChapterProposalDraft = {
  title: string;
  synopsis: string;
  afterChapterId: string | null;
  paragraphs: Paragraph[];
};

export function acceptChapterProposal(
  s: State,
  id: string,
  draft: ChapterProposalDraft,
): State {
  const p = pending(s, id);
  const siblings = manuscriptChapters(s, p.bookId);
  const anchor =
    draft.afterChapterId === null
      ? -1
      : siblings.findIndex((c) => c.id === draft.afterChapterId);
  if (draft.afterChapterId !== null && anchor < 0)
    throw Error(
      "The proposed position is no longer available. Choose a position again.",
    );
  if (
    s.chapters.some((c) => c.id === id) ||
    s.revisions.some((r) => r.id === id)
  )
    throw Error("This chapter proposal has already been applied.");
  const createdAt = now();
  // Deterministic identity makes duplicate approval across devices unable to create two chapters.
  const chapter = {
    id,
    bookId: p.bookId,
    code:
      Math.max(
        0,
        ...s.chapters.filter((c) => c.bookId === p.bookId).map((c) => c.code),
      ) + 1,
    title: draft.title.trim(),
    synopsis: draft.synopsis,
    position: anchor + 1,
    headId: id,
    approvedId: null,
  };
  const order = siblings.map((c) => c.id);
  order.splice(anchor + 1, 0, id);
  return validateState({
    ...s,
    chapters: [
      ...s.chapters.map((c) =>
        order.includes(c.id) ? { ...c, position: order.indexOf(c.id) } : c,
      ),
      chapter,
    ],
    revisions: [
      ...s.revisions,
      {
        id,
        chapterId: id,
        parentId: null,
        createdAt,
        source: "proposal",
        edition: 1,
        message: "New chapter accepted: " + p.title,
        paragraphs: structuredClone(draft.paragraphs),
      },
    ],
    chapterProposals: s.chapterProposals.map((x) =>
      x.id === id
        ? {
            ...x,
            status: "accepted",
            review: {
              chapterId: id,
              revisionId: id,
              createdAt,
              title: chapter.title,
              synopsis: chapter.synopsis,
              afterChapterId: draft.afterChapterId,
            },
          }
        : x,
    ),
  });
}

function pending(s: State, id: string): ChapterProposal {
  const p = s.chapterProposals.find((x) => x.id === id);
  if (!p || p.status !== "pending")
    throw Error(
      "This chapter proposal has already been reviewed. Refresh the proposals.",
    );
  return p;
}
export function rejectChapterProposal(s: State, id: string): State {
  pending(s, id);
  return validateState({
    ...s,
    chapterProposals: s.chapterProposals.map((p) =>
      p.id === id ? { ...p, status: "rejected" } : p,
    ),
  });
}
