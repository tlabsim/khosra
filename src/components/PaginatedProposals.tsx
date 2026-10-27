import type { ReactNode } from "react";
import type { Proposal } from "../domain/model";
import { newestProposals } from "../domain/proposalPresentation";
import PaginatedList from "./PaginatedList";
export default function PaginatedProposals({
  proposals,
  renderProposal,
  onPageChange,
}: {
  proposals: Proposal[];
  renderProposal: (proposal: Proposal) => ReactNode;
  onPageChange?: () => void;
}) {
  return (
    <PaginatedList
      items={newestProposals(proposals)}
      renderItem={renderProposal}
      label="Proposal"
      noun="proposals"
      onPageChange={onPageChange}
    />
  );
}
