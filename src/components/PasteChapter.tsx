import { useRef, useState, type ClipboardEvent } from "react";
import {
  editBreakRanges,
  htmlParagraphs,
  normalizeChapterText,
  paragraphDraft,
  parseChapterDraft,
  plainTextParagraphs,
  replaceBreakRanges,
  type ParagraphBreaks,
} from "../import/chapterText";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import "./paste-chapter.css";
type Draft = ReturnType<typeof paragraphDraft>;
type Paste = {
  plain: string;
  structured: string[] | null;
  start: number;
  end: number;
};
function pastedDraft(paste: Paste, mode: ParagraphBreaks): Draft {
  if (mode === "auto") {
    const parts = paste.structured || plainTextParagraphs(paste.plain);
    if (parts.length) return paragraphDraft(parts);
  }
  return {
    text: normalizeChapterText(
      paste.plain || paste.structured?.join("\n\n") || "",
    ).replace(/[\u000b\u2028]/g, "\n"),
    protectedBreaks: [],
  };
}
function insertDraft(
  before: Draft,
  inserted: Draft,
  start: number,
  end: number,
): Draft {
  return {
    text: before.text.slice(0, start) + inserted.text + before.text.slice(end),
    protectedBreaks: [
      ...replaceBreakRanges(
        before.protectedBreaks,
        start,
        end,
        inserted.text.length,
      ),
      ...inserted.protectedBreaks.map((r) => ({
        start: r.start + start,
        end: r.end + start,
      })),
    ],
  };
}
export default function PasteChapter({
  paragraphs,
  onSave,
}: {
  paragraphs: string[];
  onSave: (paragraphs: string[]) => void;
}) {
  const [draft, setDraft] = useState(() => paragraphDraft(paragraphs));
  const [mode, setMode] = useState<ParagraphBreaks>("auto");
  const [undo, setUndo] = useState<{
    draft: Draft;
    mode: ParagraphBreaks;
  } | null>(null);
  const [lastPaste, setLastPaste] = useState<Paste | null>(null);
  const [source, setSource] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const parsed = parseChapterDraft(draft.text, mode, draft.protectedBreaks);
  function moveCaret(position: number) {
    requestAnimationFrame(() => {
      if (textarea.current?.isConnected)
        textarea.current.setSelectionRange(position, position);
    });
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const plain = event.clipboardData.getData("text/plain");
    let structured: string[] | null = null;
    try {
      structured = htmlParagraphs(event.clipboardData.getData("text/html"));
    } catch {
      /* Plain text remains available. */
    }
    if (!plain && !structured) return;
    event.preventDefault();
    const pasted: Paste = {
      plain,
      structured,
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
    const inserted = pastedDraft(pasted, mode);
    setUndo({ draft, mode });
    setLastPaste(pasted);
    setDraft(insertDraft(draft, inserted, pasted.start, pasted.end));
    setSource(
      mode === "auto" && structured
        ? "Paragraphs preserved from formatted text."
        : "Plain text pasted. Check the paragraph count.",
    );
    moveCaret(pasted.start + inserted.text.length);
  }
  return (
    <form
      className="paste-chapter-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.length) onSave(parsed);
      }}
    >
      <div className="paste-chapter-options">
        <label>
          Paragraph breaks
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value as ParagraphBreaks;
              setMode(next);
              setSource("");
              if (undo && lastPaste) {
                const inserted = pastedDraft(lastPaste, next);
                setDraft(
                  insertDraft(
                    undo.draft,
                    inserted,
                    lastPaste.start,
                    lastPaste.end,
                  ),
                );
                moveCaret(lastPaste.start + inserted.text.length);
              }
            }}
          >
            <option value="auto">Automatic</option>
            <option value="blank">Blank lines</option>
            <option value="line">Each line</option>
          </select>
        </label>
        <span
          className="paste-paragraph-count"
          role="status"
          aria-live="polite"
        >
          {parsed.length} {parsed.length === 1 ? "paragraph" : "paragraphs"}
        </span>
      </div>
      <label htmlFor="chapter-paste-text">Chapter text</label>
      <textarea
        placeholder="Paste your chapter here…"
        aria-describedby="paste-history-note"
        ref={textarea}
        id="chapter-paste-text"
        name="text"
        rows={12}
        required
        value={draft.text}
        onPaste={paste}
        onChange={(event) => {
          const text = event.target.value;
          setDraft({
            text,
            protectedBreaks: editBreakRanges(
              draft.text,
              text,
              draft.protectedBreaks,
            ),
          });
          setUndo(null);
          setLastPaste(null);
          setSource("");
        }}
      />
      <p className="paste-source-note" role="status">
        {source || "Word paragraphs and manual line breaks are preserved."}
      </p>
      <div className="paste-chapter-footer">
        <p id="paste-history-note" className="paste-history-note">
          Unchanged paragraphs keep their addresses. Earlier text stays in
          history.
        </p>
        <div className="paste-chapter-submit">
          {undo && (
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setDraft(undo.draft);
                textarea.current?.focus();
                moveCaret(undo.draft.text.length);
                setMode(undo.mode);
                setUndo(null);
                setLastPaste(null);
                setSource("");
              }}
            >
              <ArrowCounterClockwise size={16} />
              Undo paste
            </button>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={!parsed.length}
          >
            <Check size={18} />
            Save as a new revision
          </button>
        </div>
      </div>
    </form>
  );
}
