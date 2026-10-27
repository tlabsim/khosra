import { z } from "zod";
export const FILE_LIMIT = 2 * 1024 * 1024;
export const WORKSPACE_FILE_LIMIT = 8 * 1024 * 1024;
export const MaterialDeletionSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  bookId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type MaterialDeletion = z.infer<typeof MaterialDeletionSchema>;
export const FileSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^/\\\x00-\x1f]+$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  size: z.number().int().positive().max(FILE_LIMIT),
  data: z.string().max(Math.ceil(FILE_LIMIT / 3) * 4),
});
export const MaterialSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  bookId: z.string().uuid(),
  kind: z.enum(["idea", "artifact"]),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100000),
  chapterIds: z.array(z.string().uuid()).max(1000),
  status: z.enum([
    "idea",
    "planned",
    "used",
    "discarded",
    "active",
    "archived",
  ]),
  url: z
    .string()
    .max(2000)
    .refine(
      (v) =>
        !v ||
        (!/[\x00-\x20]/.test(v) &&
          /^https?:\/\//i.test(v) &&
          (() => {
            try {
              const u = new URL(v);
              return !u.username && !u.password;
            } catch {
              return false;
            }
          })()),
      "Use an HTTP or HTTPS URL without credentials.",
    ),
  fileId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  source: z.enum(["author", "model"]),
});
export type Material = z.infer<typeof MaterialSchema>;
export type MaterialFile = z.infer<typeof FileSchema>;
export function materialHeads(rows: Material[]) {
  const parents = new Set(rows.map((r) => r.parentId));
  return rows.filter((r) => !parents.has(r.id));
}
function decodedFile(file: MaterialFile): string {
  if (file.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.data))
    throw Error("Invalid attachment encoding.");
  let raw: string;
  try {
    raw = atob(file.data);
  } catch {
    throw Error("Invalid attachment encoding.");
  }
  if (raw.length !== file.size || btoa(raw) !== file.data)
    throw Error("Attachment size or encoding mismatch.");
  const starts = (...signature: number[]) =>
    signature.every((b, i) => raw.charCodeAt(i) === b);
  const valid =
    file.mime === "image/png"
      ? starts(137, 80, 78, 71, 13, 10, 26, 10)
      : file.mime === "image/jpeg"
        ? starts(255, 216, 255)
        : file.mime === "image/webp"
          ? raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP"
          : raw.startsWith("%PDF-");
  if (!valid) throw Error("Attachment content does not match its file type.");
  return raw;
}
export function fileBytes(file: MaterialFile): Uint8Array {
  return Uint8Array.from(decodedFile(file), (c) => c.charCodeAt(0));
}
export function validateMaterials(s: {
  books: { id: string }[];
  chapters: { id: string; bookId: string }[];
  materials: Material[];
  files: MaterialFile[];
  materialDeletions?: MaterialDeletion[];
}) {
  const deleted = new Set<string>();
  for (const d of s.materialDeletions ?? []) {
    if (!s.books.some((b) => b.id === d.bookId))
      throw Error("Deleted material manuscript is missing.");
    deleted.add(d.itemId);
  }
  if (s.materials.some((m) => deleted.has(m.itemId)))
    throw Error("Deleted materials cannot be restored by an older workspace.");
  const files = new Map(s.files.map((f) => [f.id, f]));
  let total = 0;
  for (const f of s.files) {
    if (!s.books.some((b) => b.id === f.bookId))
      throw Error("Attachment manuscript is missing.");
    decodedFile(f);
    total += f.size;
  }
  if (total > WORKSPACE_FILE_LIMIT)
    throw Error(
      "Attachments exceed the 8 MiB workspace limit (including history).",
    );
  const versions = new Map(s.materials.map((m) => [m.id, m]));
  for (const m of s.materials) {
    if (
      !s.books.some((b) => b.id === m.bookId) ||
      new Set(m.chapterIds).size !== m.chapterIds.length ||
      m.chapterIds.some(
        (id) => !s.chapters.some((c) => c.id === id && c.bookId === m.bookId),
      )
    )
      throw Error("Invalid material manuscript or chapter link.");
    if (
      m.kind === "idea"
        ? !["idea", "planned", "used", "discarded"].includes(m.status) ||
          !!m.fileId ||
          !!m.url
        : !["active", "archived"].includes(m.status)
    )
      throw Error("Invalid material status or attachment.");
    if (m.fileId && files.get(m.fileId)?.bookId !== m.bookId)
      throw Error("Invalid private attachment reference.");
    const seen = new Set<string>();
    let next: Material | undefined = m;
    while (next) {
      if (seen.has(next.id)) throw Error("Cyclic material history.");
      seen.add(next.id);
      if (!next.parentId) {
        if (next.id !== m.itemId) throw Error("Invalid material root.");
        break;
      }
      const p: Material | undefined = versions.get(next.parentId);
      if (
        !p ||
        p.itemId !== m.itemId ||
        p.bookId !== m.bookId ||
        p.kind !== m.kind
      )
        throw Error("Broken material history.");
      next = p;
    }
  }
}

// Deletions win over old archives and concurrent material edits. Only attachments
// from removed versions are candidates for collection; shared files are retained.
export function applyMaterialDeletions<
  T extends {
    materials: Material[];
    files: MaterialFile[];
    materialDeletions: MaterialDeletion[];
  },
>(state: T): T {
  const deleted = new Set(state.materialDeletions.map((d) => d.itemId));
  const removedFiles = new Set(
    state.materials.filter((m) => deleted.has(m.itemId)).map((m) => m.fileId),
  );
  const materials = state.materials.filter((m) => !deleted.has(m.itemId));
  const referenced = new Set(materials.map((m) => m.fileId));
  return {
    ...state,
    materials,
    files: state.files.filter(
      (f) => !removedFiles.has(f.id) || referenced.has(f.id),
    ),
  };
}
