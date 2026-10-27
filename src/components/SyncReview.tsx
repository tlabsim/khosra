import PaginatedList from "./PaginatedList";
import { useState } from "react";
import type { State } from "../domain/model";
import { reconcile, type Choices } from "../sync/reconcile";
export default function SyncReview({
  local,
  remote,
  onMerge,
  automatic = false,
}: {
  local: State;
  remote: State;
  onMerge: (state: State) => void;
  automatic?: boolean;
}) {
  const [choices, setChoices] = useState<Choices>({});
  let original: ReturnType<typeof reconcile>,
    resolved: ReturnType<typeof reconcile>;
  try {
    original = reconcile(local, remote);
    resolved = reconcile(local, remote, choices);
  } catch (error) {
    return (
      <div role="alert">
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <p>
          No copy has been replaced. Close this dialog, export the local
          archive, and keep the server archive separately for manual
          reconciliation.
        </p>
      </div>
    );
  }
  return (
    <>
      <p>
        Both copies are preserved. Choose the working version for each conflict.
        All earlier revisions and alternate text remain in history. Independent
        revision chains are combined automatically.
      </p>
      <PaginatedList
        items={original.conflicts}
        label="Sync conflict"
        noun="conflicts"
        renderItem={(c) => (
          <section className="sync-choice" key={c.id}>
            <h3>
              {c.title} · {c.kind}
            </h3>
            <div className="sync-columns">
              {(["local", "server"] as const).map((side) => (
                <label key={side}>
                  <span>
                    <input
                      type="radio"
                      name={c.id}
                      checked={choices[c.id] === side}
                      onChange={() =>
                        setChoices((v) => ({ ...v, [c.id]: side }))
                      }
                    />
                    {side === "local" ? "This device" : "Server / ChatGPT"}
                  </span>
                  <pre>{c[side] || "(Empty)"}</pre>
                </label>
              ))}
            </div>
          </section>
        )}
      />
      {!original.conflicts.length && (
        <p>
          No divergent chapter revisions were found. The combined workspace
          retains both histories and incoming proposals.
        </p>
      )}
      {original.conflicts.length > 0 && (
        <p role="status">{resolved.conflicts.length} conflicts remaining.</p>
      )}
      <p className="caption">
        Completed server proposal decisions are retained; local flag statuses
        are retained.{" "}
        {automatic
          ? "Server saving resumes automatically after review."
          : "This merges locally; upload afterwards to save the result on the server."}
      </p>
      <button
        className="button primary"
        disabled={resolved.conflicts.length > 0}
        onClick={() => onMerge(resolved.state)}
      >
        Keep both histories & merge
      </button>
    </>
  );
}
