import { useEffect, useState } from "react";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type { ChapterProposal, State } from "../domain/model";
import { manuscriptChapters } from "../domain/chapters";
import {
  acceptChapterProposal,
  rejectChapterProposal,
  type ChapterProposalDraft,
} from "../domain/chapterProposals";
import Dialog from "../sharing/Dialog";
import "./proposal-reading.css";

export default function ChapterProposalCard({
  proposal: p,
  state,
  onSave,
  onOpenChapter,
  onEditing,
}: {
  proposal: ChapterProposal;
  state: State;
  onSave: (change: (s: State) => State) => void;
  onOpenChapter: (id: string) => void;
  onEditing: (editing: boolean) => void;
}) {
  const pending = p.status === "pending";
  const chapters = manuscriptChapters(state, p.bookId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ChapterProposalDraft>(() => ({
    title: p.title,
    synopsis: p.synopsis,
    afterChapterId: p.afterChapterId,
    paragraphs: p.paragraphs,
  }));
  const [confirmation, setConfirmation] = useState<{
    kind: "accept" | "reject";
    signature: string;
  } | null>(null);
  useEffect(() => {
    onEditing(pending && (open || !!confirmation));
    return () => onEditing(false);
  }, [onEditing, pending, open, confirmation]);
  const result = state.revisions.find((r) => r.id === p.review?.revisionId);
  const shown = pending
    ? draft
    : { ...p, ...p.review, paragraphs: result?.paragraphs ?? p.paragraphs };
  const anchorAvailable =
    draft.afterChapterId === null ||
    chapters.some((c) => c.id === draft.afterChapterId);
  const valid =
    !!draft.title.trim() &&
    draft.title.trim().length <= 300 &&
    draft.synopsis.length <= 200000 &&
    anchorAvailable;
  const signature = JSON.stringify([
    p.status,
    draft,
    chapters.map((c) => [c.id, c.position, c.title]),
  ]);
  const positionLabel = (id: string | null) =>
    id === null
      ? "At the beginning"
      : `After ${state.chapters.find((c) => c.id === id)?.title ?? "unavailable chapter"}`;
  const actions = pending ? (
    <div className="proposal-decision-actions">
      <button
        className="button primary"
        disabled={!valid}
        onClick={() => setConfirmation({ kind: "accept", signature })}
      >
        <Check aria-hidden="true" />
        Create chapter
      </button>
      <button
        className="button quiet"
        onClick={() => setConfirmation({ kind: "reject", signature })}
      >
        <X aria-hidden="true" />
        Reject this proposal
      </button>
    </div>
  ) : null;
  return (
    <section className="card proposal-card">
      <header className="proposal-card-heading">
        <span className={`status-pill proposal-status ${p.status}`}>
          {p.status}
        </span>
        <h3>{p.title}</h3>
      </header>
      <p className="caption">
        New chapter · {positionLabel(p.afterChapterId)} · {p.paragraphs.length}{" "}
        paragraphs
      </p>
      <p className="proposal-rationale">{p.rationale}</p>
      {pending && !anchorAvailable && (
        <p role="status">
          The suggested position is no longer available. Choose a position in
          the review.
        </p>
      )}
      <footer className="proposal-card-actions">
        <button className="button" onClick={() => setOpen(true)}>
          <BookOpen aria-hidden="true" />
          {pending ? "Review new chapter" : "View chapter proposal"}
        </button>
        {actions}
        {p.review && (
          <button
            className="button"
            disabled={
              !!state.chapters.find((c) => c.id === p.review!.chapterId)
                ?.deletedAt
            }
            onClick={() => onOpenChapter(p.review!.chapterId)}
          >
            Open created chapter
          </button>
        )}
      </footer>
      {open && (
        <Dialog
          title="New chapter proposal"
          className="proposal-reading-dialog chapter-proposal-dialog"
          closeLabel="Close chapter proposal"
          onClose={() => setOpen(false)}
          footer={<footer className="proposal-card-actions">{actions}</footer>}
        >
          <p>{p.rationale}</p>
          <p className="caption">
            {pending
              ? "Review the title, position and draft. Creating this chapter accepts the draft as a single proposal."
              : "This is the draft recorded at review time; later manuscript edits are kept separately."}
          </p>
          <div className="chapter-proposal-fields">
            <label>
              Chapter title
              <input
                aria-label="Proposed chapter title"
                value={shown.title}
                maxLength={300}
                readOnly={!pending}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Synopsis
              <textarea
                aria-label="Proposed chapter synopsis"
                maxLength={200000}
                value={shown.synopsis}
                readOnly={!pending}
                onChange={(e) =>
                  setDraft({ ...draft, synopsis: e.target.value })
                }
              />
            </label>
            {pending ? (
              <label>
                Position
                <select
                  aria-label="New chapter position"
                  value={draft.afterChapterId ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      afterChapterId: e.target.value || null,
                    })
                  }
                >
                  <option value="">At the beginning</option>
                  {!anchorAvailable && (
                    <option value={draft.afterChapterId!} disabled>
                      Unavailable — choose another position
                    </option>
                  )}
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      After {c.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{positionLabel(shown.afterChapterId)}</p>
            )}
          </div>
          <div className="chapter-proposal-prose">
            {shown.paragraphs.map((block, i) => (
              <div key={block.id}>
                <span className="caption">P{block.label}</span>
                <div>
                  {block.section && <h3>{block.section}</h3>}
                  {pending ? (
                    <textarea
                      aria-label={`New chapter paragraph P${block.label}`}
                      value={block.text}
                      maxLength={200000}
                      rows={Math.min(
                        12,
                        Math.max(3, block.text.split("\n").length + 1),
                      )}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          paragraphs: draft.paragraphs.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  ) : (
                    <p>{block.text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={
            confirmation.kind === "accept"
              ? "Create this chapter?"
              : "Reject this chapter proposal?"
          }
          className="proposal-confirmation-dialog"
          closeLabel="Close confirmation"
          initialFocus=".proposal-confirm-cancel"
          onClose={() => setConfirmation(null)}
          footer={
            <footer className="proposal-confirm-actions">
              <button
                className="button proposal-confirm-cancel"
                onClick={() => setConfirmation(null)}
              >
                <X aria-hidden="true" />
                Cancel
              </button>
              <button
                className="button primary"
                disabled={
                  !pending ||
                  confirmation.signature !== signature ||
                  (confirmation.kind === "accept" && !valid)
                }
                onClick={() => {
                  if (confirmation.signature !== signature) return;
                  onSave((s) =>
                    confirmation.kind === "accept"
                      ? acceptChapterProposal(s, p.id, draft)
                      : rejectChapterProposal(s, p.id),
                  );
                  setConfirmation(null);
                  setOpen(false);
                }}
              >
                {confirmation.kind === "accept" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <X aria-hidden="true" />
                )}
                {confirmation.kind === "accept"
                  ? "Confirm creation"
                  : "Confirm rejection"}
              </button>
            </footer>
          }
        >
          <p className="proposal-confirm-title">{draft.title}</p>
          <p>
            {confirmation.kind === "accept"
              ? `${positionLabel(draft.afterChapterId)}. This creates a new working chapter with ${draft.paragraphs.length} paragraphs. Existing chapters and their history are preserved.`
              : "No chapter will be created. The proposal remains in review history."}
          </p>
          {confirmation.signature !== signature && (
            <p role="alert">
              The manuscript or review changed. Cancel and review it again
              before confirming.
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
