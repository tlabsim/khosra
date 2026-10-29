import { useMemo, useState } from "react";
import { Archive } from "@phosphor-icons/react/dist/csr/Archive";
import Dialog from "../sharing/Dialog";
import { type State } from "../domain/model";
import {
  chapterCleanupPlan,
  cleanChapter,
  workspaceBytes,
} from "../domain/chapterCleanup";
import "./chapter-cleanup.css";
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
export default function ChapterCleanup({
  state,
  chapterId,
  enabled,
  onEditing,
  currentState,
  onSave,
  onError,
}: {
  state: State;
  chapterId: string;
  enabled: boolean;
  onEditing: (editing: boolean) => void;
  currentState: () => State;
  onSave: (next: State) => void;
  onError: (error: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState<State | null>(null);
  const plan = useMemo(() => {
    const targets = chapterCleanupPlan(state, chapterId);
    const cleaned = cleanChapter(state, chapterId);
    const before = workspaceBytes(state),
      after = workspaceBytes(cleaned);
    return { ...targets, before, after, saved: Math.max(0, before - after) };
  }, [state, chapterId]);
  const count =
    plan.proposalIds.length +
    plan.chapterProposalIds.length +
    plan.contextIds.length;
  const reviewed = plan.proposalIds.length + plan.chapterProposalIds.length;
  const removal = [
    reviewed ? `${reviewed} reviewed proposal${reviewed === 1 ? "" : "s"}` : "",
    plan.contextIds.length
      ? `${plan.contextIds.length} older context index${plan.contextIds.length === 1 ? "" : "es"}`
      : "",
  ]
    .filter(Boolean)
    .join(" and ");
  function close() {
    setOpen(false);
    setAcknowledged(null);
    onEditing(false);
  }
  function confirm() {
    try {
      if (!enabled) throw Error("Wait for Saved to server before cleaning up.");
      if (acknowledged !== currentState())
        throw Error(
          "Review the current cleanup and confirm that you have made a backup.",
        );
      onSave(cleanChapter(currentState(), chapterId));
      close();
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      <button
        className="button compact"
        onClick={() => {
          setOpen(true);
          setAcknowledged(null);
          onEditing(true);
        }}
      >
        <Archive size={16} />
        Clean up chapter
      </button>
      {open && (
        <Dialog
          title="Clean up chapter"
          className="cleanup-dialog"
          closeLabel="Close chapter cleanup"
          onClose={close}
          initialFocus="[data-cleanup-cancel]"
          footer={
            <footer className="chapter-cleanup-footer">
              <label className="cleanup-backup-check">
                <input
                  type="checkbox"
                  checked={acknowledged === state}
                  onChange={(e) =>
                    setAcknowledged(e.currentTarget.checked ? state : null)
                  }
                />
                I have made a backup
              </label>
              <button className="button" data-cleanup-cancel onClick={close}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={
                  !enabled || !count || !plan.saved || acknowledged !== state
                }
                onClick={confirm}
              >
                <Archive size={18} />
                Confirm cleanup
              </button>
            </footer>
          }
        >
          {removal && <p>Remove {removal} from this chapter.</p>}
          {!enabled && (
            <p role="status">Wait for Saved to server before cleaning up.</p>
          )}
          <dl className="cleanup-sizes">
            <div>
              <dt>Workspace now</dt>
              <dd>{size(plan.before)}</dd>
            </div>
            <div>
              <dt>After cleanup</dt>
              <dd>{size(plan.after)}</dd>
            </div>
            <div>
              <dt>Space recovered</dt>
              <dd>{size(plan.saved)}</dd>
            </div>
          </dl>
          <p>Manuscript text, revision history and pending work stay.</p>
          <p className="cleanup-warning">
            Permanent cleanup. Removed records remain only in your backup.
          </p>
          <details className="cleanup-details">
            <summary>What’s kept?</summary>
            <p>
              Current and approved text, every revision, pending proposals,
              flags, the latest context, ideas and artifacts are kept. Reviewed
              proposal drafts and receipts are removed. Older synced copies and
              restored archives cannot undo cleanup.
            </p>
          </details>
          {!count || !plan.saved ? (
            <p role="status">Nothing to clean up in this chapter yet.</p>
          ) : null}
        </Dialog>
      )}
    </>
  );
}
