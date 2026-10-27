import { useMemo, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import type { Proposal, Revision, Paragraph } from "../domain/model";
import {
  mergeProposal,
  validProposalChoices,
  type ProposalResolution,
  type MergeChoice,
} from "../domain/proposalMerge";
import {
  proposalChanges,
  selectProposalChanges,
} from "../domain/proposalSelection";
import ProposalReadingDialog from "./ProposalReadingDialog";
import Dialog from "../sharing/Dialog";

export default function ProposalCard({
  proposal,
  original,
  current,
  onAccept,
  previewParagraphs,
  onReject,
}: {
  proposal: Proposal;
  original: Revision;
  current: Revision;
  onAccept: (paragraphs: Paragraph[], resolution: ProposalResolution) => void;
  onReject: () => void;
  previewParagraphs: (paragraphs: Paragraph[]) => Paragraph[];
}) {
  const pending = proposal.status === "pending";
  const [open, setOpen] = useState(false);
  const [paragraphs, setParagraphs] = useState(
    proposal.review?.paragraphs ?? proposal.paragraphs,
  );
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(proposal.review?.declinedChangeIds ?? []),
  );
  const [resolution, setResolution] = useState<
    ProposalResolution & { reviewed: Revision }
  >({
    revisionId: current.id,
    reviewed: current,
    choices: Object.fromEntries(
      (proposal.review?.choices ?? []).map((x) => [x.id, x.choice]),
    ),
  });
  const [confirmation, setConfirmation] = useState<{
    kind: "accept" | "reject";
    signature: string;
  } | null>(null);
  const groups = useMemo(
    () => proposalChanges(original.paragraphs, paragraphs),
    [original.paragraphs, paragraphs],
  );
  const allIds = groups.flatMap((g) => g.paragraphIds);
  const effectiveExcluded = new Set(
    groups
      .filter(
        (g) =>
          proposal.status === "rejected" ||
          g.paragraphIds.some((id) => excluded.has(id)),
      )
      .flatMap((g) => g.paragraphIds),
  );
  const selectedIds = allIds.filter((id) => !effectiveExcluded.has(id));
  const choices =
    resolution.revisionId === current.id
      ? resolution.choices
      : validProposalChoices(
          resolution.reviewed.paragraphs,
          current.paragraphs,
          resolution.choices,
        );
  const selectedParagraphs = selectProposalChanges(
    original.paragraphs,
    paragraphs,
    selectedIds,
  );
  const merged = mergeProposal(
    original.paragraphs,
    selectedParagraphs,
    current.paragraphs,
    choices,
  );
  const selectedGroups = groups.filter(
    (g) => !effectiveExcluded.has(g.paragraphIds[0]),
  ).length;
  const total = groups.length;
  const acceptLabel =
    selectedGroups === total
      ? "Accept all proposed changes"
      : `Accept selected (${selectedGroups} of ${total})`;
  const signature = JSON.stringify([
    current.id,
    paragraphs,
    selectedIds,
    choices,
    proposal.status,
  ]);
  const canAccept =
    pending && selectedGroups > 0 && merged.unresolved.length === 0;
  function resolve(id: string, choice: MergeChoice) {
    if (choice === "current" && id !== "paragraph-order") {
      const group = groups.find((g) => g.paragraphIds.includes(id));
      if (group) toggle(group.paragraphIds, false);
      const next = { ...choices };
      delete next[id];
      setResolution({
        revisionId: current.id,
        reviewed: current,
        choices: next,
      });
      return;
    }
    setResolution({
      revisionId: current.id,
      reviewed: current,
      choices: { ...choices, [id]: choice },
    });
  }
  function toggle(ids: string[], checked: boolean) {
    setExcluded((old) => {
      const next = new Set(old);
      for (const id of ids) {
        if (checked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }
  const actions = pending ? (
    <div className="proposal-decision-actions">
      <button
        className="button primary proposal-accept-action"
        aria-label={acceptLabel}
        disabled={!canAccept}
        onClick={() => setConfirmation({ kind: "accept", signature })}
      >
        <Check aria-hidden="true" />
        <span className="proposal-action-desktop-label">{acceptLabel}</span>
        <span className="proposal-action-mobile-label">
          {selectedGroups === total ? "Accept all" : acceptLabel}
        </span>
      </button>
      <button
        className="button quiet"
        onClick={() => setConfirmation({ kind: "reject", signature })}
      >
        <X aria-hidden="true" />
        <span>Reject this proposal</span>
      </button>
    </div>
  ) : null;
  return (
    <section className="card proposal-card">
      <header className="proposal-card-heading">
        <span className={`status-pill proposal-status ${proposal.status}`}>
          {proposal.status.replace("-", " ")}
        </span>
        <h3>{proposal.title}</h3>
      </header>
      <p className="proposal-rationale">{proposal.rationale}</p>
      {pending && merged.unresolved.length > 0 && (
        <p className="proposal-conflict-notice" role="status">
          Some selected passages also changed in your draft. Review them and
          choose what to keep.
        </p>
      )}
      {proposal.review && (
        <p className="caption">
          {proposal.review.selectedChangeIds.length} paragraph changes accepted
          · {proposal.review.declinedChangeIds.length} declined. The original
          proposal is preserved.
        </p>
      )}
      <footer className="proposal-card-actions">
        <button className="button" onClick={() => setOpen(true)}>
          <BookOpen aria-hidden="true" />
          {pending ? "Review proposal" : "View reviewed proposal"}
        </button>
        {actions}
      </footer>
      {open && (
        <ProposalReadingDialog
          proposal={proposal}
          original={original}
          current={current}
          paragraphs={paragraphs}
          groups={groups}
          excluded={effectiveExcluded}
          choices={choices}
          conflicts={merged.conflicts}
          onResolve={resolve}
          onToggle={toggle}
          onEdit={setParagraphs}
          previewParagraphs={previewParagraphs}
          onClose={() => setOpen(false)}
          footer={actions}
        />
      )}
      {confirmation && (
        <Dialog
          title={
            confirmation.kind === "reject"
              ? "Reject this proposal?"
              : selectedGroups === total
                ? `Accept all ${total} proposed changes?`
                : `Accept ${selectedGroups} of ${total} changes?`
          }
          closeLabel="Close confirmation"
          initialFocus=".proposal-confirm-cancel"
          onClose={() => setConfirmation(null)}
        >
          <p>{proposal.title}</p>
          <p>
            {confirmation.kind === "reject"
              ? "Your manuscript will remain unchanged."
              : selectedGroups === total
                ? "The selected changes will be saved as a new revision. Earlier text remains in history."
                : `The remaining ${total - selectedGroups} changes will be declined. This completes the review and moves the proposal to Partially accepted.`}
          </p>
          {confirmation.signature !== signature && (
            <p role="alert">
              The draft or review changed. Cancel and review it again before
              confirming.
            </p>
          )}
          <div className="actions">
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
                confirmation.signature !== signature ||
                !pending ||
                (confirmation.kind === "accept" && !canAccept)
              }
              onClick={() => {
                if (confirmation.signature !== signature) return;
                if (confirmation.kind === "accept")
                  onAccept(paragraphs, {
                    revisionId: current.id,
                    choices,
                    selectedChangeIds: selectedIds,
                  });
                else onReject();
                setConfirmation(null);
              }}
            >
              {confirmation.kind === "reject" ? (
                <X aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {confirmation.kind === "reject"
                ? "Confirm rejection"
                : "Confirm acceptance"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
