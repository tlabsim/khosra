import { useState } from "react";
import type { Proposal, Revision, Paragraph } from "../domain/model";
import {
  changedParagraphIds,
  comparisonRanges,
} from "../domain/proposalComparison";
import LazyDetails from "./LazyDetails";
import type { ProposalConflict, MergeChoice } from "../domain/proposalMerge";

export default function ProposalReview({
  proposal,
  original,
  current,
  paragraphs,
  onEdit,
  merged,
  conflicts,
  choices,
  onResolve,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  paragraphs: Paragraph[];
  onEdit: (paragraphs: Paragraph[]) => void;
  merged: Paragraph[];
  conflicts: ProposalConflict[];
  choices: Record<string, MergeChoice>;
  onResolve: (id: string, choice: MergeChoice) => void;
}) {
  const [tab, setTab] = useState("after");
  const changed = changedParagraphIds(original.paragraphs, proposal.paragraphs);
  for (const id of changedParagraphIds(original.paragraphs, paragraphs))
    changed.add(id);
  const rows =
    tab === "before"
      ? original.paragraphs
      : tab === "after"
        ? proposal.status === "pending"
          ? merged
          : paragraphs
        : current.paragraphs;
  const ranges = comparisonRanges(rows, changed, [
    original.paragraphs,
    paragraphs,
  ]);
  const old = new Map(original.paragraphs.map((p) => [p.id, p]));
  const afterIds = new Set(paragraphs.map((p) => p.id));
  const removed = original.paragraphs.filter((p) => !afterIds.has(p.id));
  const rangeLabel = (ps: Paragraph[]) =>
    ps.length === 1
      ? `P${ps[0].label}`
      : `P${ps[0].label}–P${ps.at(-1)!.label}`;
  function readOnly(p: Paragraph) {
    return (
      <p className="compare-paragraph" key={p.id}>
        <span className="comparison-id">P{p.label}</span>{" "}
        {p.section && <strong className="compare-section">{p.section} </strong>}
        <span className="compare-text">{p.text || "Empty paragraph"}</span>
      </p>
    );
  }
  function context(ps: Paragraph[], direction: string) {
    if (!ps.length) return null;
    return (
      <LazyDetails
        className="proposal-context"
        summary={
          <>
            <span>
              {direction} {ps.length}{" "}
              {ps.length === 1 ? "paragraph" : "paragraphs"}
            </span>
            <small>{rangeLabel(ps)} · read-only</small>
          </>
        }
      >
        {() => ps.map(readOnly)}
      </LazyDetails>
    );
  }
  return (
    <div className="proposal-review">
      <div
        className="proposal-comparison-tabs"
        role="group"
        aria-label="Comparison version"
      >
        {[
          ["before", "Before"],
          [
            "after",
            proposal.status === "pending" ? "After · editable" : "After",
          ],
          ["current", "Current manuscript"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="comparison-explanation">
        {tab === "before"
          ? "Text used to create this proposal." +
            (original.id === current.id
              ? " It matches the current manuscript."
              : " Your later edits appear in Current manuscript.")
          : tab === "current"
            ? "Your latest saved draft." +
              (original.id === current.id
                ? " It matches Before."
                : " This includes edits made since the proposal.")
            : proposal.status === "pending"
              ? "Proposed changes, keeping your other current edits. You can edit the proposed text below."
              : "The saved proposal. Current manuscript shows your latest draft."}
      </p>
      {proposal.status === "pending" &&
        conflicts.map((conflict) => (
          <fieldset className="proposal-conflict-choice" key={conflict.id}>
            <legend>
              {conflict.kind === "order"
                ? "Choose paragraph order"
                : `${conflict.label} was also edited in the current draft`}
            </legend>
            <div role="group" aria-label={`Resolve ${conflict.label}`}>
              <button
                aria-pressed={choices[conflict.id] === "current"}
                onClick={() => onResolve(conflict.id, "current")}
              >
                {conflict.kind === "order"
                  ? "Use current order"
                  : `Keep current ${conflict.label}`}
              </button>
              <button
                aria-pressed={choices[conflict.id] === "proposal"}
                onClick={() => onResolve(conflict.id, "proposal")}
              >
                {conflict.kind === "order"
                  ? "Use proposed order"
                  : `Use proposed ${conflict.label}`}
              </button>
            </div>
          </fieldset>
        ))}
      {removed.length > 0 && (
        <p className="proposal-removals">
          Removed in proposal: {removed.map((p) => `P${p.label}`).join(", ")}.
          View Before to read them.
        </p>
      )}
      {!changed.size && <p>No paragraph changes.</p>}
      {ranges.map((range, i) => (
        <section
          className="proposal-range"
          key={`${tab}:${i}`}
          aria-label={`Change range ${i + 1}`}
        >
          {context(range.earlier, "Earlier")}
          {range.paragraphs.length === 0 && (
            <p className="caption">
              Passage absent in this version. The surrounding paragraphs show
              where this change belongs.
            </p>
          )}
          {range.paragraphs.map((p) =>
            tab === "after" &&
            proposal.status === "pending" &&
            choices[p.id] !== "current" &&
            paragraphs.some((item) => item.id === p.id) ? (
              <label key={p.id} className="changed">
                P{p.label}
                {old.has(p.id) ? " · changed" : " · added"}
                {p.section && <strong>{p.section}</strong>}
                {!p.section && old.get(p.id)?.section && (
                  <small>Subsection heading removed</small>
                )}
                <textarea
                  aria-label={`Proposed P${p.label}`}
                  value={p.text}
                  rows={Math.max(
                    3,
                    Math.min(14, Math.ceil(p.text.length / 80)),
                  )}
                  onChange={(event) =>
                    onEdit(
                      paragraphs.map((item) =>
                        item.id === p.id
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ) : (
              readOnly(p)
            ),
          )}
          {context(range.later, "Later")}
        </section>
      ))}
    </div>
  );
}
