import { commit, head, type State } from "./model";

export type ParagraphSession = {
  chapterId: string;
  baseId: string;
  headId: string;
};

export function startParagraphSession(
  s: State,
  chapterId: string,
): ParagraphSession {
  const c = s.chapters.find(
    (chapter) => chapter.id === chapterId && !chapter.deletedAt,
  );
  if (!c) throw Error("This chapter is no longer available.");
  return { chapterId, baseId: c.headId, headId: c.headId };
}

export function checkParagraphSession(s: State, session: ParagraphSession) {
  const c = s.chapters.find(
    (chapter) => chapter.id === session.chapterId && !chapter.deletedAt,
  );
  if (!c || c.headId !== session.headId)
    throw Error(
      "This chapter changed outside the editing session. Review the latest revision before cancelling or saving edits.",
    );
  return c;
}

/** Restore prose through a new immutable revision, retaining all abandoned work. */
export function cancelParagraphSession(
  s: State,
  session: ParagraphSession,
): State {
  const c = checkParagraphSession(s, session);
  const original = s.revisions.find(
    (r) => r.id === session.baseId && r.chapterId === c.id,
  );
  if (!original) throw Error("The original editing revision is unavailable.");
  if (
    JSON.stringify(head(s, c).paragraphs) ===
    JSON.stringify(original.paragraphs)
  )
    return s;
  return commit(
    s,
    c.id,
    session.headId,
    original.paragraphs,
    "Cancelled paragraph editing session",
    "restore",
  );
}
