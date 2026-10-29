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
      <section className="chapter-cleanup">
        <div>
          <h3>Chapter cleanup</h3>
          <p>
            Remove reviewed proposal copies and older context indexes when you
            finish a chapter. Revision history stays available.
          </p>
        </div>
        <button
          className="button"
          disabled={!enabled}
          onClick={() => {
            setOpen(true);
            setBackedUp(null);
            onEditing(true);
          }}
        >
          <Archive size={18} />
          Clean up chapter
        </button>
        {!enabled && (
          <p className="caption">
            Wait for Saved to server before cleaning up.
          </p>
        )}
      </section>
      {open && (
        <Dialog
          title="Clean up chapter"
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
                  disabled={!count || !plan.saved || busy}
                  onClick={confirm}
                >
                  <Archive size={18} />
                  Confirm cleanup
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!count || !plan.saved || busy}
                  onClick={() => void backup()}
                >
                  <DownloadSimple size={18} />
                  {busy ? "Preparing backup…" : "Download backup first"}
                </button>
              )}
            </footer>
          }
        >
          <p>
            This removes{" "}
            {plan.proposalIds.length + plan.chapterProposalIds.length} reviewed
            proposals (including their review receipts) and{" "}
            {plan.contextIds.length} older context indexes from this chapter.
          </p>
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
          <p>
            Current and approved text, all revision history, pending proposals,
            flags, the latest context, ideas and artifacts are kept.
          </p>
          <p>
            Removed proposals and indexes will only be available in your
            downloaded backup. Restoring an old archive into this synced
            workspace does not undo cleanup.
          </p>
          {!count || !plan.saved ? (
            <p role="status">Nothing to clean up in this chapter yet.</p>
          ) : backedUp === state ? (
            <p role="status">
              Backup download started. Check that the file was saved before
              confirming permanent cleanup.
            </p>
          ) : (
            <p>Download a full workspace backup, then confirm cleanup.</p>
          )}
        </Dialog>
      )}
    </>
  );
}
