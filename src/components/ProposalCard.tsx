import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import type { Proposal, Revision, Paragraph } from "../domain/model";
import ProposalReview from "./ProposalReview";

export default function ProposalCard({
  proposal,
  original,
  current,
  expanded,
  onToggle,
  onAccept,
  onReject,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  expanded: boolean;
  onToggle: () => void;
  onAccept: (paragraphs: Paragraph[]) => void;
  onReject: () => void;
}) {
  const [paragraphs, setParagraphs] = useState(proposal.paragraphs);
  const stale = proposal.baseRevisionId !== current.id;
  return (
    <section className="card proposal-card">
      <header className="proposal-card-heading">
        <span className={`status-pill proposal-status ${proposal.status}`}>
          {proposal.status}
        </span>
        <h3>{proposal.title}</h3>
      </header>
      <p className="proposal-rationale">{proposal.rationale}</p>
      {stale && proposal.status === "pending" && (
        <p className="error">
          The chapter changed since this proposal was created. Compare it with
          the current manuscript; acceptance is blocked.
        </p>
      )}
      {expanded && (
        <ProposalReview
          proposal={proposal}
          original={original}
          current={current}
          paragraphs={paragraphs}
          onEdit={setParagraphs}
        />
      )}
      <footer className="proposal-card-actions">
        <button className="button" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? "Close comparison" : "Compare before & after"}
        </button>
        {proposal.status === "pending" && (
          <div className="proposal-decision-actions">
            <button
              className="button primary"
              aria-label="Accept this revision"
              disabled={stale}
              onClick={() => onAccept(paragraphs)}
            >
              <Check />
              Accept revision
            </button>
            <button className="button quiet" onClick={onReject}>
              Reject proposal
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
