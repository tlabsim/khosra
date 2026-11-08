import { BookSchema, type Book, type State, uid } from "./model";
import { equalValue } from "./equal";
import {
  FILE_LIMIT,
  MANUSCRIPT_FILE_LIMIT,
  FileSchema,
  fileBytes,
  type MaterialFile,
} from "./materials";

export type BookDetails = Pick<
  Book,
  "title" | "premise" | "language" | "coverFileId"
>;

export function updateBookDetails(
  state: State,
  original: Book,
  details: BookDetails,
  upload?: MaterialFile,
): State {
  const current = state.books.find((b) => b.id === original.id);
  if (!current || !equalValue(current, original))
    throw Error(
      "Manuscript details changed. Close this dialog and reopen it to edit the latest version.",
    );
  const book = BookSchema.parse({
    ...current,
    ...details,
    title: details.title.trim(),
  });
  if (upload) {
    FileSchema.parse(upload);
    fileBytes(upload);
    if (
      upload.bookId !== book.id ||
      upload.id !== book.coverFileId ||
      !upload.mime.startsWith("image/")
    )
      throw Error("Invalid manuscript cover attachment.");
    if (state.files.some((f) => f.id === upload.id))
      throw Error("Cover attachment ID already exists.");
    if (
      state.files
        .filter((f) => f.bookId === book.id)
        .reduce((n, f) => n + f.size, upload.size) > MANUSCRIPT_FILE_LIMIT
    )
      throw Error(
        "Attachments exceed the 8 MiB manuscript limit (including history).",
      );
  }
  const files = upload ? [...state.files, upload] : state.files;
  if (
    book.coverFileId &&
    !files.some(
      (f) =>
        f.id === book.coverFileId &&
        f.bookId === book.id &&
        f.mime.startsWith("image/"),
    )
  )
    throw Error("Invalid manuscript cover attachment.");
  return {
    ...state,
    books: state.books.map((b) => (b.id === book.id ? book : b)),
    files,
  };
}

export async function readCover(
  file: File,
  bookId: string,
): Promise<MaterialFile> {
  if (!file.size || file.size > FILE_LIMIT)
    throw Error("Choose a PNG, JPEG or WebP image up to 2 MiB.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Choose a PNG, JPEG or WebP image.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const cover = FileSchema.parse({
    id: uid(),
    bookId,
    name: file.name.replace(/[/\\\x00-\x1f]/g, "_").slice(0, 200),
    mime: file.type,
    size: file.size,
    data: btoa(raw),
  });
  fileBytes(cover);
  return cover;
}
