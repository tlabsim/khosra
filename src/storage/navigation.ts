import type { State } from "../domain/model";
import { manuscriptChapters } from "../domain/chapters";

const key = "khosra-workspace-navigation-v1";
type Navigation = { bookId: string; chapters: Record<string, string> };

/** Device preference only: never part of manuscript sync or archives. */
export function readNavigation(): Navigation {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value.bookId !== "string")
      return { bookId: "", chapters: {} };
    const chapters = Object.fromEntries(
      Object.entries(value.chapters || {}).filter(
        ([, id]) => typeof id === "string",
      ),
    ) as Record<string, string>;
    return { bookId: value.bookId, chapters };
  } catch {
    return { bookId: "", chapters: {} };
  }
}

export function rememberedChapter(state: State, bookId: string) {
  const chapters = manuscriptChapters(state, bookId);
  const saved = readNavigation().chapters[bookId];
  return chapters.find((chapter) => chapter.id === saved) || chapters[0];
}

export function rememberNavigation(bookId: string, chapterId?: string) {
  if (!bookId) return;
  try {
    const saved = readNavigation();
    // Keep the active entry last; bound stale entries from removed manuscripts.
    const chapters = Object.fromEntries(
      Object.entries(saved.chapters)
        .filter(([id]) => id !== bookId)
        .slice(-255),
    );
    if (chapterId) chapters[bookId] = chapterId;
    localStorage.setItem(key, JSON.stringify({ bookId, chapters }));
  } catch {
    // Restricted/full storage must not prevent opening a manuscript.
  }
}
