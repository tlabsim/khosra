import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import type { Proposal, Revision, Paragraph } from "../domain/model";
import ProposalReview from "./ProposalReview";
import {
  mergeProposal,
  validProposalChoices,
  type ProposalResolution,
  type MergeChoice,
} from "../domain/proposalMerge";

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
  onAccept: (paragraphs: Paragraph[], resolution: ProposalResolution) => void;
  onReject: () => void;
}) {
  const [paragraphs, setParagraphs] = useState(proposal.paragraphs);
  const [resolution, setResolution] = useState<
    ProposalResolution & { reviewed: Revision }
  >({
    revisionId: current.id,
    reviewed: current,
    choices: {},
  });
  const choices =
    resolution.revisionId === current.id
      ? resolution.choices
      : validProposalChoices(
          resolution.reviewed.paragraphs,
          current.paragraphs,
          resolution.choices,
        );
  const merged = mergeProposal(
    original.paragraphs,
    paragraphs,
    current.paragraphs,
    choices,
  );
  const stale = proposal.baseRevisionId !== current.id;
  function resolve(id: string, choice: MergeChoice) {
    setResolution({
      revisionId: current.id,
      reviewed: current,
      choices: { ...choices, [id]: choice },
    });
  }
  return (
    <section className="card proposal-card">
      <header className="proposal-card-heading">
        <span className={`status-pill proposal-status ${proposal.status}`}>
          {proposal.status}
        </span>
        <h3>{proposal.title}</h3>
      </header>
      <p className="proposal-rationale">{proposal.rationale}</p>
      {proposal.status === "pending" && merged.unresolved.length > 0 ? (
        <p className="proposal-conflict-notice" role="status">
          {merged.unresolved.map((x) => x.label).join(", ")} changed in both
          versions. Open comparison and choose what to keep.
        </p>
      ) : stale && proposal.status === "pending" ? (
        <p className="caption">
          Edits elsewhere in the current manuscript will be kept.
        </p>
      ) : null}
      {expanded && (
        <ProposalReview
          proposal={proposal}
          original={original}
          current={current}
          paragraphs={paragraphs}
          onEdit={setParagraphs}
          merged={merged.paragraphs}
          conflicts={merged.conflicts}
          choices={choices}
          onResolve={resolve}
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
              disabled={merged.unresolved.length > 0}
              onClick={() =>
                onAccept(paragraphs, { revisionId: current.id, choices })
              }
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
