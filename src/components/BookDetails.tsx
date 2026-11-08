import { useId, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { readCover, type BookDetails as Details } from "../domain/bookDetails";
import type { Book } from "../domain/model";
import type { MaterialFile } from "../domain/materials";

export default function BookDetails({
  book,
  files,
  onSave,
  onCancel,
}: {
  book: Book;
  files: MaterialFile[];
  onSave: (original: Book, details: Details, upload?: MaterialFile) => void;
  onCancel: () => void;
}) {
  const premiseId = useId();
  const [original] = useState(book);
  const [title, setTitle] = useState(book.title);
  const [premise, setPremise] = useState(book.premise);
  const [language, setLanguage] = useState(book.language);
  const [coverId, setCoverId] = useState(book.coverFileId ?? null);
  const [upload, setUpload] = useState<MaterialFile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cover = upload ?? files.find((f) => f.id === coverId);
  return (
    <form
      className="book-details-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        try {
          onSave(
            original,
            { title, premise, language, coverFileId: coverId },
            upload,
          );
        } catch (problem) {
          setError(
            problem instanceof Error
              ? problem.message
              : "Could not save manuscript details.",
          );
        }
      }}
    >
      <div className="book-details-cover">
        <div className="book-cover-preview">
          {cover ? (
            <img
              src={`data:${cover.mime};base64,${cover.data}`}
              alt="Manuscript cover preview"
            />
          ) : (
            <Image size={32} weight="light" aria-hidden="true" />
          )}
        </div>
        <div>
          <label>
            Cover image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  const next = await readCover(file, original.id);
                  setUpload(next);
                  setCoverId(next.id);
                } catch (problem) {
                  setError(
                    problem instanceof Error
                      ? problem.message
                      : "Could not read this image.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <p className="caption">
            PNG, JPEG or WebP · up to 2 MiB. Shown in your Library.
          </p>
          {cover && (
            <button
              className="button quiet compact"
              type="button"
              disabled={busy}
              onClick={() => {
                setCoverId(null);
                setUpload(undefined);
              }}
            >
              <Trash />
              Remove cover
            </button>
          )}
          {busy && <p role="status">Preparing cover…</p>}
        </div>
      </div>
      <label>
        Manuscript name
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
        />
      </label>
      <div className="book-details-field">
        <label htmlFor={premiseId}>Premise</label>
        <textarea
          id={premiseId}
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          rows={3}
        />
      </div>
      <label>
        Manuscript language
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "bn")}
        >
          <option value="bn">বাংলা · Bengali</option>
          <option value="en">English</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="book-details-actions">
        <button type="button" className="button" onClick={onCancel}>
          <X />
          Cancel
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={busy || !title.trim()}
        >
          <Check />
          Save changes
        </button>
      </div>
    </form>
  );
}
