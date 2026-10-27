import { useState } from "react";
import type { Proposal, Revision, Paragraph } from "../domain/model";
import {
  changedParagraphIds,
  comparisonRanges,
} from "../domain/proposalComparison";
import LazyDetails from "./LazyDetails";

export default function ProposalReview({
  proposal,
  original,
  current,
  paragraphs,
  onEdit,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  paragraphs: Paragraph[];
  onEdit: (paragraphs: Paragraph[]) => void;
}) {
  const [tab, setTab] = useState("after");
  const changed = changedParagraphIds(original.paragraphs, proposal.paragraphs);
  for (const id of changedParagraphIds(original.paragraphs, paragraphs))
    changed.add(id);
  const rows =
    tab === "before"
      ? original.paragraphs
      : tab === "after"
        ? paragraphs
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
      <div className="compare-paragraph" key={p.id}>
        <small>P{p.label}</small>
        {p.section && <h4>{p.section}</h4>}
        <p>{p.text || "Empty paragraph"}</p>
      </div>
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
          <div className="proposal-range-heading">
            <strong>
              {range.paragraphs.length
                ? rangeLabel(range.paragraphs)
                : "Passage absent in this version"}
            </strong>
            <span>
              {tab === "after" && proposal.status === "pending"
                ? "Proposed text"
                : "Read-only"}
            </span>
          </div>
          {range.paragraphs.length === 0 && (
            <p className="caption">
              The surrounding paragraphs show where this change belongs.
            </p>
          )}
          {range.paragraphs.map((p) =>
            tab === "after" && proposal.status === "pending" ? (
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
