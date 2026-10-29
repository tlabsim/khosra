import { useMemo, useState } from "react";
import { Archive } from "@phosphor-icons/react/dist/csr/Archive";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import Dialog from "../sharing/Dialog";
import { type State } from "../domain/model";
import {
  chapterCleanupPlan,
  cleanChapter,
  workspaceBytes,
} from "../domain/chapterCleanup";
import { download, exportBackup } from "../storage/db";
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
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState<State | null>(null);
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
    if (!busy) {
      setOpen(false);
      setBackedUp(null);
      onEditing(false);
    }
  }
  async function backup() {
    setBusy(true);
    try {
      const source = currentState();
      const archive = await exportBackup(source);
      download(
        archive,
        `khosra-before-cleanup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setBackedUp(source);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function confirm() {
    try {
      if (!enabled) throw Error("Wait for Saved to server before cleaning up.");
      if (backedUp !== currentState())
        throw Error(
          "Workspace changed. Download a fresh backup before cleanup.",
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
          setBackedUp(null);
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
              <button
                className="button"
                data-cleanup-cancel
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              {backedUp === state ? (
                <button
                  className="button primary"
                  disabled={!enabled || !count || !plan.saved || busy}
                  onClick={confirm}
                >
                  <Archive size={18} />
                  Confirm cleanup
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!enabled || !count || !plan.saved || busy}
                  onClick={() => void backup()}
                >
                  <DownloadSimple size={18} />
                  {busy ? "Preparing backup…" : "Download backup first"}
                </button>
              )}
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
          ) : backedUp === state ? (
            <p role="status">Check that your backup was saved, then confirm.</p>
          ) : null}
        </Dialog>
      )}
    </>
  );
}
