import { useMemo, useRef, useState, type ReactNode } from "react";
import Dialog from "../sharing/Dialog";
import type { Paragraph, Proposal, Revision } from "../domain/model";
import { buildProposalReading, withRemoved } from "../domain/proposalReading";
import type { ProposalChange } from "../domain/proposalSelection";
import {
  mergeProposal,
  type MergeChoice,
  type ProposalConflict,
} from "../domain/proposalMerge";
import "./proposal-reading.css";

export default function ProposalReadingDialog({
  proposal,
  original,
  current,
  paragraphs,
  groups,
  excluded,
  choices,
  conflicts,
  onResolve,
  onToggle,
  onEdit,
  previewParagraphs,
  onClose,
  footer,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  paragraphs: Paragraph[];
  groups: ProposalChange[];
  excluded: Set<string>;
  choices: Record<string, MergeChoice>;
  conflicts: ProposalConflict[];
  onResolve: (id: string, choice: MergeChoice) => void;
  onToggle: (ids: string[], checked: boolean) => void;
  onEdit: (rows: Paragraph[]) => void;
  previewParagraphs: (rows: Paragraph[]) => Paragraph[];
  onClose: () => void;
  footer: ReactNode;
}) {
  const pending = proposal.status === "pending";
  const [showDeleted, setShowDeleted] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  // Reconstructed only while the author explicitly opens this review.
  const preview = useMemo(() => {
    if (!pending) return buildProposalReading(original.paragraphs, paragraphs);
    const changed = new Set(groups.flatMap((g) => g.paragraphIds));
    const currentIds = new Set(current.paragraphs.map((p) => p.id));
    // Keep the latest context, including author insertions. Restore a missing
    // source block only when it is itself part of this proposal's review.
    const baseline = withRemoved(
      original.paragraphs.filter(
        (p) => currentIds.has(p.id) || changed.has(p.id),
      ),
      current.paragraphs,
    );
    const intended = mergeProposal(
      original.paragraphs,
      paragraphs,
      current.paragraphs,
    ).paragraphs;
    return buildProposalReading(baseline, previewParagraphs(intended), changed);
  }, [
    pending,
    original.paragraphs,
    current.paragraphs,
    paragraphs,
    groups,
    previewParagraphs,
  ]);
  const groupById = new Map(
    groups.flatMap((g) => g.paragraphIds.map((id) => [id, g] as const)),
  );
  const allIds = groups.flatMap((g) => g.paragraphIds);
  const selected = allIds.filter((id) => !excluded.has(id)).length;
  const selectAll = useRef<HTMLInputElement>(null);
  const currentById = new Map(
    (pending ? current : original).paragraphs.map((p) => [p.id, p]),
  );
  const rows = preview.combined.filter(
    (row) =>
      showDeleted || row.kind !== "paragraph" || row.change !== "removed",
  );
  const orderConflict = conflicts.find((c) => c.kind === "order");
  function conflictButtons(id: string, label: string) {
    return (
      <div
        className="proposal-conflict-choice"
        role="group"
        aria-label={`Resolve ${label}`}
      >
        <p>
          {id === "paragraph-order"
            ? "Choose paragraph order."
            : "This passage was also edited in your current draft."}
        </p>
        <button
          className="button compact"
          aria-pressed={choices[id] === "current"}
          onClick={() => onResolve(id, "current")}
        >
          {id === "paragraph-order"
            ? "Use current order"
            : `Keep current ${label}`}
        </button>{" "}
        <button
          className="button compact"
          aria-pressed={choices[id] === "proposal"}
          onClick={() => onResolve(id, "proposal")}
        >
          {id === "paragraph-order"
            ? "Use proposed order"
            : `Use proposed ${label}`}
        </button>
      </div>
    );
  }
  return (
    <Dialog
      title={pending ? "Review proposal" : "Reviewed proposal"}
      className="proposal-reading-dialog"
      closeLabel="Close proposal review"
      initialFocus=".proposal-reading-deleted-toggle input"
      onClose={onClose}
      context={
        <div className="proposal-reading-controls">
          <p className="proposal-reading-title">{proposal.title}</p>
          <div className="proposal-reading-summary">
            <span className="proposal-reading-counts">
              <span className="reading-modified">
                {preview.changed} modified
              </span>{" "}
              · <span className="reading-added">{preview.added} added</span> ·{" "}
              <span className="reading-deleted">{preview.removed} deleted</span>
            </span>
            <label className="proposal-reading-deleted-toggle">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
              Show deleted
            </label>
          </div>
          {pending ? (
            <div className="proposal-selection-heading">
              <label>
                <input
                  ref={(el) => {
                    selectAll.current = el;
                    if (el)
                      el.indeterminate =
                        selected > 0 && selected < allIds.length;
                  }}
                  type="checkbox"
                  aria-label="Accept all changes"
                  checked={allIds.length > 0 && selected === allIds.length}
                  onChange={(e) => onToggle(allIds, e.target.checked)}
                />
                Accept
              </label>
              <span>
                Uncheck changes to decline them. Linked replacements are
                selected together.
              </span>
            </div>
          ) : (
            <p className="caption">
              Saved proposal and review decisions. This is not your latest
              manuscript.
            </p>
          )}
        </div>
      }
      footer={
        footer && <footer className="proposal-review-footer">{footer}</footer>
      }
    >
      {pending &&
        orderConflict &&
        conflictButtons(orderConflict.id, orderConflict.label)}
      <article
        className="proposal-reading-prose"
        tabIndex={0}
        role="document"
        aria-label="Proposed changes"
      >
        {!rows.length && <p>No paragraph changes to review.</p>}
        {rows.map((row, i) => {
          if (row.kind === "gap")
            return (
              <div
                className="proposal-reading-gap"
                key={`gap-${i}`}
                role="separator"
                aria-label={`${row.count} unchanged paragraphs omitted`}
              >
                <span aria-hidden="true">
                  . . .<br />. . .
                </span>
              </div>
            );
          const p = row.paragraph,
            group = groupById.get(p.id),
            baseline = currentById.get(p.id);
          const changed = !!group;
          const checked = !excluded.has(p.id);
          const conflict = conflicts.find((c) => c.id === p.id);
          const display = !changed && baseline ? baseline : p;
          return (
            <div
              className={`proposal-reading-paragraph is-${row.change}${changed && !checked ? " is-declined" : ""}`}
              key={p.id}
              data-paragraph-id={p.id}
              data-change={row.change}
            >
              <div className="proposal-reading-selection">
                {pending && group && (
                  <label className="proposal-accept-cell">
                    <input
                      type="checkbox"
                      aria-label={`Accept P${p.label}${group.linked ? " (linked changes)" : ""}`}
                      checked={checked}
                      onChange={(e) =>
                        onToggle(group.paragraphIds, e.target.checked)
                      }
                    />
                  </label>
                )}
              </div>
              <span className="proposal-reading-id">
                P{p.label}
                {changed && (
                  <small>
                    {row.change === "removed"
                      ? "Deleted"
                      : row.change === "added"
                        ? "Added"
                        : "Modified"}
                    {group?.linked ? " · linked" : ""}
                    {!checked ? " · declined" : !pending ? " · accepted" : ""}
                  </small>
                )}
              </span>
              <div className="proposal-reading-text">
                {display.section && <h3>{display.section}</h3>}
                {editing === p.id && pending ? (
                  <label className="proposal-inline-editor">
                    Proposed P{p.label}
                    <textarea
                      aria-label={`Proposed P${p.label}`}
                      rows={5}
                      value={
                        paragraphs.find((x) => x.id === p.id)?.text ?? p.text
                      }
                      onChange={(e) =>
                        onEdit(
                          paragraphs.map((x) =>
                            x.id === p.id ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      className="button compact"
                      onClick={() => setEditing(null)}
                    >
                      Done editing
                    </button>
                  </label>
                ) : (
                  <p>
                    {row.change === "removed" ? (
                      <del>{display.text || "\u00a0"}</del>
                    ) : (
                      display.text || "\u00a0"
                    )}
                  </p>
                )}
                {changed && choices[p.id] === "current" && (
                  <p className="caption">Current text will be kept.</p>
                )}
                {changed && row.change !== "removed" && (
                  <div className="proposal-paragraph-tools">
                    {row.change === "changed" && (
                      <button
                        className="proposal-reading-original-toggle"
                        aria-expanded={expanded.has(p.id)}
                        aria-label={`${expanded.has(p.id) ? "Hide" : "Show"} ${pending ? "current" : "original"} P${p.label}`}
                        onClick={() =>
                          setExpanded((old) => {
                            const next = new Set(old);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                      >
                        {expanded.has(p.id) ? "Hide" : "Show"}{" "}
                        {pending ? "current" : "original"}
                      </button>
                    )}
                    {pending && (
                      <button
                        className="proposal-reading-original-toggle"
                        aria-label={`Edit P${p.label}`}
                        onClick={() =>
                          setEditing(editing === p.id ? null : p.id)
                        }
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
                {row.change === "changed" && expanded.has(p.id) && (
                  <section
                    className="proposal-reading-original"
                    aria-label={`${pending ? "Current" : "Original"} P${p.label}`}
                  >
                    <span className="proposal-reading-original-label">
                      {pending ? "Current draft" : "Original source"}
                    </span>
                    {baseline?.section && <h3>{baseline.section}</h3>}
                    <p>
                      {baseline?.text ??
                        "This paragraph is absent in this version."}
                    </p>
                  </section>
                )}
                {pending &&
                  conflict &&
                  checked &&
                  conflictButtons(p.id, conflict.label)}
              </div>
            </div>
          );
        })}
      </article>
    </Dialog>
  );
}
