import { useState } from "react";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { GitBranch } from "@phosphor-icons/react/dist/csr/GitBranch";
import {
  acceptProposal,
  rejectProposal,
  labelProposalParagraphs,
  head,
  type State,
  type Chapter,
  type Proposal,
  type ChapterProposal,
} from "../domain/model";
import ProposalCard from "./ProposalCard";
import ChapterProposalCard from "./ChapterProposalCard";
import PaginatedList from "./PaginatedList";
import Empty from "./Empty";

type Entry =
  | { kind: "revision"; proposal: Proposal }
  | { kind: "chapter"; proposal: ChapterProposal };
export default function ProposalsPage({
  state,
  bookId,
  chapter,
  onImport,
  onSave,
  onOpenChapter,
  onEditing,
}: {
  state: State;
  bookId: string;
  chapter?: Chapter;
  onImport: () => void;
  onSave: (change: (s: State) => State) => void;
  onOpenChapter: (id: string) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [filter, setFilter] = useState("pending");
  const entries: Entry[] = [
    ...state.proposals
      .filter((p) => p.chapterId === chapter?.id)
      .map((proposal) => ({ kind: "revision" as const, proposal })),
    ...state.chapterProposals
      .filter((p) => p.bookId === bookId)
      .map((proposal) => ({ kind: "chapter" as const, proposal })),
  ];
  const matches = (status: string, value: string) =>
    value === "all" ||
    status === value ||
    (value === "accepted" && status === "partially-accepted");
  const filtered = entries
    .filter((x) => matches(x.proposal.status, filter))
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        (Date.parse(b.entry.proposal.createdAt) || 0) -
          (Date.parse(a.entry.proposal.createdAt) || 0) || b.index - a.index,
    )
    .map((x) => x.entry);
  return (
    <main className="page">
      <div className="section-heading">
        <h2>Proposals</h2>
        {chapter && entries.length > 0 && (
          <button className="button" onClick={onImport}>
            <UploadSimple aria-hidden="true" />
            Import proposal
          </button>
        )}
      </div>
      {state.chapterProposals.some((p) => p.bookId === bookId) && (
        <p className="caption">
          Revisions for this chapter and new-chapter proposals for this
          manuscript.
        </p>
      )}
      <div
        className="review-tabs proposal-filters"
        role="group"
        aria-label="Filter proposals"
      >
        {["all", "pending", "accepted", "rejected"].map((value) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            aria-label={`${(value[0].toUpperCase() + value.slice(1)).replace("-", " ")} proposals`}
            onClick={() => setFilter(value)}
          >
            {(value[0].toUpperCase() + value.slice(1)).replace("-", " ")}{" "}
            <span>
              {entries.filter((x) => matches(x.proposal.status, value)).length}
            </span>
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <Empty
          icon={GitBranch}
          title="No proposals yet"
          text="Ask ChatGPT to propose a revision or a new chapter. Saved proposals appear here for your approval."
        >
          {chapter && (
            <button className="button primary" onClick={onImport}>
              <UploadSimple />
              Import proposal
            </button>
          )}
        </Empty>
      ) : (
        !filtered.length && <p>No {filter.replace("-", " ")} proposals.</p>
      )}
      <PaginatedList
        key={`${bookId}:${chapter?.id}:${filter}`}
        items={filtered}
        label="Proposal"
        noun="proposals"
        renderItem={(entry) =>
          entry.kind === "chapter" ? (
            <ChapterProposalCard
              key={entry.proposal.id}
              proposal={entry.proposal}
              state={state}
              onSave={onSave}
              onOpenChapter={onOpenChapter}
              onEditing={onEditing}
            />
          ) : (
            <ProposalCard
              key={entry.proposal.id}
              proposal={entry.proposal}
              original={state.revisions.find(
                (r) => r.id === entry.proposal.baseRevisionId,
              )!}
              current={head(state, chapter!)}
              previewParagraphs={(paragraphs) =>
                labelProposalParagraphs(
                  state,
                  chapter!,
                  head(state, chapter!),
                  paragraphs,
                )
              }
              onAccept={(paragraphs, resolution) =>
                onSave((s) =>
                  acceptProposal(s, entry.proposal, paragraphs, resolution),
                )
              }
              onReject={() =>
                onSave((s) => rejectProposal(s, entry.proposal.id))
              }
            />
          )
        }
      />
    </main>
  );
}
