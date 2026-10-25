import { now, type State } from "./model";

export function manuscriptChapters(s: State, bookId: string) {
  return s.chapters
    .filter((c) => c.bookId === bookId && !c.deletedAt)
    .sort((a, b) => a.position - b.position);
}

// Keep chapter UUIDs, readable codes and every linked record intact in Trash.
export function trashChapter(s: State, id: string): State {
  const chapter = s.chapters.find((c) => c.id === id);
  if (!chapter || chapter.deletedAt)
    throw Error("Chapter is no longer in this manuscript.");
  const active = manuscriptChapters(s, chapter.bookId);
  const position = active.findIndex((c) => c.id === id);
  const remaining = active.filter((c) => c.id !== id);
  return {
    ...s,
    chapters: s.chapters.map((c) => {
      if (c.id === id) return { ...c, position, deletedAt: now() };
      const index = remaining.findIndex((x) => x.id === c.id);
      return index >= 0 ? { ...c, position: index } : c;
    }),
  };
}

export function restoreChapter(s: State, id: string): State {
  const chapter = s.chapters.find((c) => c.id === id);
  if (!chapter?.deletedAt) throw Error("Chapter is no longer in Trash.");
  const active = manuscriptChapters(s, chapter.bookId);
  active.splice(
    Math.max(0, Math.min(active.length, Math.floor(chapter.position))),
    0,
    chapter,
  );
  return {
    ...s,
    chapters: s.chapters.map((c) => {
      const position = active.findIndex((x) => x.id === c.id);
      if (position < 0) return c;
      if (c.id !== id) return { ...c, position };
      const restored = { ...c, position };
      delete restored.deletedAt;
      return restored;
    }),
  };
}
