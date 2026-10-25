import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import type { Proposal, Revision, Paragraph } from "../domain/model";
function ProposalReview({
  proposal,
  original,
  current,
  onAccept,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  onAccept: (ps: Paragraph[]) => void;
}) {
  const [paragraphs, setParagraphs] = useState(proposal.paragraphs);
  const [tab, setTab] = useState("after");
  return (
    <div className="proposal-review">
      <div className="review-tabs">
        <button
          className={tab === "before" ? "active" : ""}
          onClick={() => setTab("before")}
        >
          Before
        </button>
        <button
          className={tab === "after" ? "active" : ""}
          onClick={() => setTab("after")}
        >
          After · editable
        </button>
        <button
          className={tab === "current" ? "active" : ""}
          onClick={() => setTab("current")}
        >
          Current manuscript
        </button>
      </div>
      {tab === "after"
        ? paragraphs.map((p, i) => (
            <label
              key={p.id}
              className={
                original.paragraphs.find((x) => x.id === p.id)?.text !== p.text
                  ? "changed"
                  : ""
              }
            >
              P{p.label}
              {original.paragraphs.find((x) => x.id === p.id)?.text !== p.text
                ? " · changed"
                : ""}
              <textarea
                aria-label={`Proposed P${p.label}`}
                value={p.text}
                rows={Math.max(3, Math.ceil(p.text.length / 80))}
                disabled={proposal.status !== "pending"}
                onChange={(e) =>
                  setParagraphs((ps) =>
                    ps.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          ))
        : (tab === "before" ? original : current).paragraphs.map((p) => (
            <div className="compare-paragraph" key={p.id}>
              <small>P{p.label}</small>
              <p>{p.text}</p>
            </div>
          ))}
      {proposal.status === "pending" && (
        <button
          className="button primary"
          disabled={proposal.baseRevisionId !== current.id}
          onClick={() => onAccept(paragraphs)}
        >
          <Check />
          Accept this revision
        </button>
      )}
    </div>
  );
}

export default ProposalReview;
