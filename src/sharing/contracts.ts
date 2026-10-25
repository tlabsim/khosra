import { z } from "zod";
import { ParagraphSchema } from "../domain/model";
export const sharedChapterSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  number: z.number().int(),
  revisionId: z.string().uuid(),
  paragraphs: z.array(ParagraphSchema),
});
export const guestSessionSchema = z.object({
  invitationId: z.string().uuid(),
  title: z.string(),
  language: z.string(),
  expiresAt: z.number(),
  csrf: z.string(),
  chapters: z.array(sharedChapterSchema.omit({ paragraphs: true })).min(1),
});
export const invitationSchema = z.object({
  id: z.string().uuid(),
  recipient: z.string(),
  bookId: z.string().uuid(),
  title: z.string(),
  chapterCount: z.number(),
  createdAt: z.number(),
  expiresAt: z.number(),
  revokedAt: z.number().nullable(),
});
export const commentSchema = z.object({
  id: z.string().uuid(),
  chapter_id: z.string().uuid(),
  revision_id: z.string().uuid(),
  paragraph_id: z.string().uuid().nullable(),
  chapter_title: z.string(),
  paragraph_label: z.coerce.number().nullable(),
  quote: z.string(),
  comment_text: z.string(),
  created_at: z.coerce.number(),
});
export type GuestSession = z.infer<typeof guestSessionSchema>;
export type SharedChapter = z.infer<typeof sharedChapterSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type ReaderComment = z.infer<typeof commentSchema>;
export class GuestRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function guestRequest(
  path: string,
  body?: unknown,
  csrf?: string,
  signal?: AbortSignal,
  invitationId?: string,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 10000);
  try {
    const response = await fetch("/api/guest/" + path, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(invitationId ? { "X-Guest-Invitation": invitationId } : {}),
        ...(csrf ? { "X-Guest-CSRF": csrf } : {}),
      },
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
    });
    const data = await response
      .json()
      .catch(() => ({ error: "The reading server is unavailable." }));
    if (!response.ok)
      throw new GuestRequestError(
        data.error || "Reading access is unavailable.",
        response.status,
      );
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
