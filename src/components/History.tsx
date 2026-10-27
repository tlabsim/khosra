import PaginatedList from "./PaginatedList";
import LazyDetails from "./LazyDetails";
import { historyGroups, historyTitle, visibleHead } from "../domain/history";
import { useState } from "react";
import { removedPassages } from "../domain/paragraphRecovery";
import "./history.css";
import type { Revision } from "../domain/model";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
export default function History({
  revisions,
  currentId,
  onRead,
  onRestore,
  onRestoreParagraph,
}: {
  revisions: Revision[];
  currentId: string;
  onRead: (id: string) => void;
  onRestore: (id: string) => void;
  onRestoreParagraph: (sourceId: string, paragraphId: string) => void;
}) {
  const [deletedOnly, setDeletedOnly] = useState(false);
  const current = revisions.find((r) => r.id === currentId);
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const changes = (r: Revision) =>
    removedPassages(r, byId.get(r.parentId || ""));
  const groups = historyGroups(revisions).flatMap((g) => {
    if (!deletedOnly) return [g];
    return g.rows
      .filter((r) => changes(r).length)
      .map((r) => ({ key: r.id, rows: [r] }));
  });
  const visibleCurrentId = visibleHead(revisions, currentId);
  function row(r: Revision) {
    return (
      <div key={r.id}>
        <div className="history-row">
          <div className="history-node">
            <ClockCounterClockwise size={20} />
          </div>
          <div>
            <h3>{historyTitle(r)}</h3>
            <p className="caption">
              {new Date(r.createdAt).toLocaleString()} · {r.source} ·{" "}
              {r.id.slice(0, 8)} · {r.paragraphs.length} paragraphs
            </p>
          </div>
          {r.id === visibleCurrentId ? (
            <span className="status-pill">Current</span>
          ) : (
            <>
              <button className="button" onClick={() => onRead(r.id)}>
                Read
              </button>
              <button className="button quiet" onClick={() => onRestore(r.id)}>
                Restore chapter
              </button>
            </>
          )}
        </div>
        {changes(r).length > 0 && (
          <LazyDetails
            className="history-passages"
            defaultOpen={deletedOnly}
            summary={
              <>
                {changes(r).length} deleted or cleared{" "}
                {changes(r).length === 1 ? "paragraph" : "paragraphs"}
              </>
            }
          >
            {() => (
              <PaginatedList
                items={changes(r)}
                label="Deleted passage"
                noun="passages"
                renderItem={({ paragraph: p, kind }) => {
                  const present = current?.paragraphs.find(
                    (x) => x.id === p.id,
                  );
                  const available =
                    !present ||
                    (!present.text.trim() && Boolean(p.text.trim()));
                  return (
                    <article className="history-passage" key={p.id}>
                      <div className="history-passage-header">
                        <strong>P{p.label}</strong>
                        <span>
                          {kind === "cleared" ? "Text cleared" : "Deleted"}
                        </span>
                        <button
                          className="button quiet compact"
                          disabled={!available}
                          onClick={() => onRestoreParagraph(r.parentId!, p.id)}
                        >
                          {available
                            ? "Restore paragraph"
                            : "Already in manuscript"}
                        </button>
                      </div>
                      {p.section && <h4>{p.section}</h4>}
                      <p>{p.text || <em>Empty paragraph</em>}</p>
                      {present?.text.trim() && present.text !== p.text && (
                        <p className="caption">
                          This paragraph has current text. Read this revision to
                          compare earlier wording.
                        </p>
                      )}
                    </article>
                  );
                }}
              />
            )}
          </LazyDetails>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="history-filters" role="group" aria-label="History filter">
        <button
          className="button compact"
          aria-pressed={!deletedOnly}
          onClick={() => setDeletedOnly(false)}
        >
          All revisions
        </button>
        <button
          className="button compact"
          aria-pressed={deletedOnly}
          onClick={() => setDeletedOnly(true)}
        >
          Deleted & cleared
        </button>
      </div>
      {deletedOnly && !groups.length && (
        <p className="caption">
          No deleted or cleared paragraphs in this chapter.
        </p>
      )}
      <PaginatedList
        key={String(deletedOnly)}
        items={groups}
        label="History"
        noun={deletedOnly ? "revisions" : "history sessions"}
        renderItem={(g) => (
          <section key={g.rows[0].id}>
            {row(g.rows[0])}
            {g.rows.length > 1 && (
              <LazyDetails
                className="recovery-snapshots"
                summary={
                  <>{g.rows.length - 1} recovery snapshots in this session</>
                }
              >
                {() => (
                  <PaginatedList
                    items={g.rows.slice(1)}
                    label="Recovery snapshot"
                    noun="snapshots"
                    renderItem={row}
                  />
                )}
              </LazyDetails>
            )}
          </section>
        )}
      />
    </>
  );
}
