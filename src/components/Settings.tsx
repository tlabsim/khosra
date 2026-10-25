import { CircleHalf } from "@phosphor-icons/react/dist/csr/CircleHalf";
import { useHighContrast } from "../appearance";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { Cloud } from "@phosphor-icons/react/dist/csr/Cloud";
import { ChatCircleText } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { Archive } from "@phosphor-icons/react/dist/csr/Archive";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";

export default function Settings({
  backLabel,
  onBack,
  bookTitle,
  serverReady,
  onConnect,
  onDisconnect,
  onUpload,
  onPull,
  onBackup,
  onRestore,
  onExport,
  onCopy,
  onError,
}: {
  backLabel: string;
  onBack: () => void;
  bookTitle?: string;
  serverReady: boolean;
  onConnect: (password: string) => Promise<void>;
  onDisconnect: () => void;
  onUpload: () => void;
  onPull: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onExport: () => void;
  onCopy: (text: string) => void;
  onError: (message: string) => void;
}) {
  const endpoint = new URL("/api/mcp", window.location.origin).href;
  const [connecting, setConnecting] = useState(false);
  const [highContrast, setHighContrast] = useHighContrast();
  async function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = String(new FormData(form).get("password") || "");
    setConnecting(true);
    try {
      await onConnect(password);
      form.reset();
    } catch (error) {
      onError(String(error));
    } finally {
      setConnecting(false);
    }
  }
  return (
    <main className="settings-page">
      <header className="settings-heading">
        <button className="settings-back" onClick={onBack}>
          <ArrowLeft size={18} />
          {backLabel}
        </button>
        <h1>Settings &amp; connections</h1>
      </header>
      <div className="settings-grid">
        <section className="settings-panel" aria-labelledby="server-heading">
          <div className="settings-panel-heading">
            <span className="settings-panel-icon">
              <Cloud size={22} />
            </span>
            <h2 id="server-heading">Private server</h2>
            <span
              className={`settings-connection-state ${serverReady ? "connected" : ""}`}
            >
              <i />
              {serverReady ? "Connected" : "Not connected"}
            </span>
          </div>
          <p>Keep a copy on your server and exchange revisions with ChatGPT.</p>
          {!serverReady ? (
            <form className="settings-login" onSubmit={(e) => void connect(e)}>
              <label htmlFor="owner-password">Owner password</label>
              <div className="settings-login-fields">
                <input
                  id="owner-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={connecting}
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={connecting}
                >
                  {connecting ? "Connecting…" : "Connect"}
                  <ArrowUpRight size={18} />
                </button>
              </div>
            </form>
          ) : (
            <div className="settings-session">
              <span>Signed in to your private workspace</span>
              <button className="settings-text-button" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          )}
          <div className="settings-sync-actions">
            <button
              className="button"
              disabled={!serverReady}
              onClick={onUpload}
            >
              <UploadSimple size={18} />
              Upload local workspace
            </button>
            <button className="button" disabled={!serverReady} onClick={onPull}>
              <DownloadSimple size={18} />
              Download server workspace
            </button>
          </div>
          <p className="settings-note">
            Sync is manual. Download after ChatGPT saves a proposal. Conflicting
            changes are kept for review.
          </p>
        </section>
        <section className="settings-panel" aria-labelledby="chatgpt-heading">
          <div className="settings-panel-heading">
            <span className="settings-panel-icon">
              <ChatCircleText size={22} />
            </span>
            <h2 id="chatgpt-heading">ChatGPT</h2>
          </div>
          <p>
            Read passages and save proposed rewrites from your conversation. You
            approve changes in Khosra.
          </p>
          <div className="settings-endpoint">
            <span>Connection URL</span>
            <div>
              <code>{endpoint}</code>
              <button
                className="icon"
                aria-label="Copy connection URL"
                title="Copy connection URL"
                onClick={() => onCopy(endpoint)}
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
          <details className="settings-connection-help">
            <summary>How to connect</summary>
            <ol>
              <li>
                Add a custom MCP connection in ChatGPT using the URL above.
              </li>
              <li>Choose OAuth and sign in with your Khosra owner password.</li>
              <li>Allow reading and proposals, then try reading a chapter.</li>
            </ol>
            <p>
              Availability and voice access depend on your ChatGPT plan and
              client.
            </p>
          </details>
          <button
            className="button settings-instructions"
            onClick={() =>
              onCopy(
                "Start with get_khosra_guide for the Khosra workflow, then list_books to choose the manuscript. Use the Khosra tools to read the latest manuscript. Fetch the current revision before proposing changes. Save changes as proposals and summarize briefly in chat. Never treat context summaries or past chat memory as the authoritative manuscript. Reindex only when asked; target about 20% of original length and preserve evidence references.",
              )
            }
          >
            <Copy size={18} />
            Copy project instructions
          </button>
          <p className="settings-note">
            Uses your ChatGPT subscription. Khosra makes no model API calls.
          </p>
        </section>
        <section
          className="settings-panel settings-appearance"
          aria-labelledby="appearance-heading"
        >
          <div className="settings-panel-heading">
            <span className="settings-panel-icon">
              <CircleHalf size={22} />
            </span>
            <h2 id="appearance-heading">Appearance</h2>
          </div>
          <label className="settings-appearance-row">
            <span>
              <strong>High contrast</strong>
              <span id="high-contrast-description">
                Darker text, icons and borders. Keeps your colors and textures.
                Saved on this device.
              </span>
            </span>
            <span className="settings-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label="High contrast"
                aria-describedby="high-contrast-description"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true" />
            </span>
          </label>
        </section>
        <section
          className="settings-panel settings-backups"
          aria-labelledby="backups-heading"
        >
          <div className="settings-panel-heading">
            <span className="settings-panel-icon">
              <Archive size={22} />
            </span>
            <h2 id="backups-heading">Backups &amp; recovery</h2>
          </div>
          <div className="settings-backup-row">
            <div>
              <h3>Full archive</h3>
              <p>All books, revisions, flags, proposals and context indexes.</p>
            </div>
            <button className="button" onClick={onBackup}>
              <DownloadSimple size={18} />
              Download full archive
            </button>
          </div>
          <div className="settings-backup-row">
            <div>
              <h3>Restore an archive</h3>
              <p>
                Replaces this device’s workspace after saving a safety backup.
              </p>
            </div>
            <button className="button" onClick={onRestore}>
              <UploadSimple size={18} />
              Restore archive
            </button>
          </div>
          <div className="settings-backup-row">
            <div>
              <h3>Manuscript text</h3>
              {bookTitle ? (
                <>
                  <strong className="settings-export-title">{bookTitle}</strong>
                  <p>Entire manuscript · Current chapters as Markdown.</p>
                </>
              ) : (
                <p>Open a manuscript to export its text.</p>
              )}
            </div>
            <button className="button" disabled={!bookTitle} onClick={onExport}>
              <FileText size={18} />
              Export this book as text
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
