import { useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import Dialog from "../sharing/Dialog";
import "./mcp-diagnostics.css";

type Event = {
  at: string;
  stage: string;
  status: number;
  elapsedMs: number;
  peakBytes: number;
  reason: string | null;
};
export type DiagnosticReport = {
  revision: string;
  serverTime: string;
  environment: {
    phpVersion: string;
    memoryLimit: string;
    maxExecutionSeconds: number;
    postMaxSize: string;
  };
  storage: {
    available: boolean;
    issue: string | null;
    retentionDays: number;
    maxEvents: number;
    bytes: number;
  };
  requests: {
    id: string;
    at: string;
    method: string;
    tool: string;
    stage: string;
    outcome: string;
    status: number;
    elapsedMs: number;
    peakBytes: number;
    inputBytes: number;
    memoryLimit?: string;
    reason: string | null;
    events: Event[];
  }[];
  page: number;
  pageSize: number;
  totalRequests: number;
  totalEvents: number;
};
const label = (value: string) => value.replaceAll("_", " ");
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export default function McpDiagnostics({
  enabled,
  load,
  purge,
  onCopy,
}: {
  enabled: boolean;
  load: (page: number) => Promise<DiagnosticReport>;
  purge: (days: number | null) => Promise<unknown>;
  onCopy: (text: string) => void;
}) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [days, setDays] = useState("7");
  async function refresh(page = 1) {
    setBusy(true);
    setError("");
    try {
      setReport(await load(page));
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    setError("");
    try {
      await purge(days === "all" ? null : Number(days));
      setConfirm(false);
      setReport(await load(1));
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="settings-connection-help mcp-diagnostics">
      <summary>Connection diagnostics</summary>
      <p>
        Private request stages and error categories, stored in a separate SQLite
        database. Manuscript text and credentials are excluded.
      </p>
      <div className="diagnostic-actions">
        <button
          className="button compact"
          disabled={!enabled || busy}
          onClick={() => void refresh(report?.page || 1)}
        >
          <ArrowClockwise size={17} />
          {busy
            ? "Loading…"
            : report
              ? "Refresh diagnostics"
              : "Load diagnostics"}
        </button>
        <button
          className="button compact"
          disabled={!report || busy}
          onClick={() => report && onCopy(JSON.stringify(report, null, 2))}
        >
          <Copy size={17} />
          Copy report
        </button>
        <button
          className="button quiet compact"
          disabled={!report?.storage.available || busy || !report.totalEvents}
          onClick={() => setConfirm(true)}
        >
          <Trash size={17} />
          Purge logs
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {report && (
        <div aria-busy={busy}>
          <dl className="diagnostic-environment">
            <div>
              <dt>PHP memory limit</dt>
              <dd>{report.environment.memoryLimit}</dd>
            </div>
            <div>
              <dt>Execution limit</dt>
              <dd>
                {report.environment.maxExecutionSeconds
                  ? `${report.environment.maxExecutionSeconds}s`
                  : "Unlimited"}
              </dd>
            </div>
            <div>
              <dt>PHP version</dt>
              <dd>{report.environment.phpVersion}</dd>
            </div>
            <div>
              <dt>MCP revision</dt>
              <dd>{report.revision}</dd>
            </div>
          </dl>
          {!report.storage.available ? (
            <p role="alert">
              Private diagnostic storage is unavailable ({report.storage.issue}
              ). Check PDO SQLite support and the private directory’s
              permissions.
            </p>
          ) : (
            <>
              <p className="settings-note">
                {report.totalRequests}{" "}
                {report.totalRequests === 1 ? "request" : "requests"} ·{" "}
                {report.totalEvents}{" "}
                {report.totalEvents === 1 ? "event" : "events"} ·{" "}
                {mb(report.storage.bytes)}. Kept for{" "}
                {report.storage.retentionDays} days, up to{" "}
                {report.storage.maxEvents.toLocaleString()} events. Times below
                use this device’s timezone.
              </p>
              {!report.requests.length && (
                <p>
                  No diagnostic requests recorded yet. Try the ChatGPT
                  submission, then refresh this report.
                </p>
              )}
              <div className="diagnostic-requests">
                {report.requests.map((request) => (
                  <article
                    key={request.id}
                    className={
                      request.status >= 400
                        ? "diagnostic-request has-error"
                        : "diagnostic-request"
                    }
                  >
                    <header>
                      <strong>
                        {request.tool === "unknown"
                          ? request.method
                          : request.tool}
                      </strong>
                      <span>
                        {label(request.outcome)} · {request.status}
                      </span>
                    </header>
                    <p>
                      <time dateTime={request.at}>
                        {new Date(request.at).toLocaleString()}
                      </time>{" "}
                      · {request.elapsedMs} ms · peak {mb(request.peakBytes)} ·
                      input {mb(request.inputBytes)}
                      {request.memoryLimit
                        ? ` · limit ${request.memoryLimit}`
                        : ""}
                    </p>
                    {request.reason && (
                      <p className="diagnostic-reason">
                        {label(request.reason)}
                      </p>
                    )}
                    <details>
                      <summary>Request {request.id}</summary>
                      <ol>
                        {request.events.map((event, i) => (
                          <li key={i}>
                            <span>{label(event.stage)}</span>
                            <span>
                              {event.status} · {event.elapsedMs} ms
                              {event.reason ? ` · ${label(event.reason)}` : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </article>
                ))}
              </div>
              {report.totalRequests > report.pageSize && (
                <nav
                  className="diagnostic-pagination"
                  aria-label="Diagnostic pages"
                >
                  <button
                    className="button compact"
                    disabled={busy || report.page <= 1}
                    onClick={() => void refresh(report.page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {report.page} of{" "}
                    {Math.ceil(report.totalRequests / report.pageSize)}
                  </span>
                  <button
                    className="button compact"
                    disabled={
                      busy ||
                      report.page * report.pageSize >= report.totalRequests
                    }
                    onClick={() => void refresh(report.page + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
          <p className="settings-note">
            “Response generated” means PHP prepared the response; it does not
            confirm receipt by ChatGPT. Requests stopped before PHP starts
            cannot be recorded here.
          </p>
        </div>
      )}
      {confirm && (
        <Dialog
          title="Purge diagnostic logs?"
          closeLabel="Close diagnostic purge"
          onClose={() => !busy && setConfirm(false)}
          initialFocus="[data-diagnostic-cancel]"
          footer={
            <footer className="diagnostic-confirm-actions">
              <button
                className="button"
                disabled={busy}
                data-diagnostic-cancel
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void clear()}
              >
                <Trash size={17} />
                {busy ? "Purging…" : "Confirm purge"}
              </button>
            </footer>
          }
        >
          <p>Choose which diagnostic entries to remove.</p>
          <label>
            Purge range
            <select
              value={days}
              disabled={busy}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="1">Older than 1 day</option>
              <option value="7">Older than 7 days</option>
              <option value="30">Older than 30 days</option>
              <option value="all">All diagnostic logs</option>
            </select>
          </label>
          <p className="settings-note">
            This permanently removes the selected diagnostic records. New
            requests will create fresh entries.
          </p>
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </details>
  );
}
