import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Pulse } from "@phosphor-icons/react/dist/csr/Pulse";
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
  recordingEnabled: boolean | null;
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
    maxExecutionSeconds?: number;
    paragraphs?: number | null;
    replacements?: number | null;
    insertions?: number | null;
    revision?: string;
    reason: string | null;
    events: Event[];
  }[];
  page: number;
  pageSize: number;
  totalRequests: number;
  totalEvents: number;
  totalRecordedRequests: number;
  tools: string[];
};
export type DiagnosticFilters = {
  outcome: string;
  tool: string;
  search: string;
};
const label = (value: string) => value.replaceAll("_", " ");
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export default function McpDiagnostics({
  enabled,
  onBack,
  setRecording,
  load,
  purge,
  onCopy,
}: {
  enabled: boolean;
  onBack: () => void;
  setRecording: (enabled: boolean) => Promise<unknown>;
  load: (page: number, filters: DiagnosticFilters) => Promise<DiagnosticReport>;
  purge: (days: number | null) => Promise<unknown>;
  onCopy: (text: string) => void;
}) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [days, setDays] = useState("7");
  const [filters, setFilters] = useState<DiagnosticFilters>({
    outcome: "all",
    tool: "",
    search: "",
  });
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const loader = useRef(load);
  const sequence = useRef(0);
  useEffect(() => {
    loader.current = load;
  }, [load]);
  const refresh = useCallback(
    async (page = 1) => {
      if (!enabled) return;
      const request = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const result = await loader.current(page, filters);
        if (sequence.current === request) setReport(result);
      } catch (problem) {
        if (sequence.current === request) setError(String(problem));
      } finally {
        if (sequence.current === request) setBusy(false);
      }
    },
    [enabled, filters],
  );
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  async function toggleRecording(value: boolean) {
    if (!report || busy) return;
    const previous = report;
    setReport({ ...report, recordingEnabled: value });
    setBusy(true);
    setError("");
    try {
      await setRecording(value);
      setNotice(
        value
          ? "MCP diagnostics enabled for new requests."
          : "MCP diagnostics paused for new requests.",
      );
      setReport(await loader.current(report?.page || 1, filters));
    } catch (problem) {
      setReport(previous);
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
      setNotice("Diagnostic logs purged.");
      setConfirm(false);
      setReport(await loader.current(1, filters));
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="settings-page mcp-diagnostics">
      <header className="settings-heading">
        <button className="settings-back" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to settings
        </button>
        <h1>Connection logs</h1>
        <p>
          Trace ChatGPT requests, investigate failures and manage log storage.
        </p>
      </header>
      <section
        className="diagnostic-recording"
        aria-label="Diagnostic recording"
      >
        <div>
          <strong>MCP diagnostics</strong>
          <p>
            Applies to new requests across all manuscripts and devices. Existing
            logs remain available.
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            role="switch"
            aria-label="Record MCP diagnostics"
            checked={report?.recordingEnabled === true}
            disabled={
              !enabled ||
              busy ||
              !report?.storage.available ||
              typeof report.recordingEnabled !== "boolean"
            }
            onChange={(event) => void toggleRecording(event.target.checked)}
          />
          {typeof report?.recordingEnabled !== "boolean"
            ? "Unavailable"
            : report.recordingEnabled
              ? "Enabled"
              : "Paused"}
        </label>
      </section>
      <div className="diagnostic-actions">
        <button
          className="button compact"
          disabled={!enabled || busy}
          onClick={() => void refresh(report?.page || 1)}
        >
          <ArrowClockwise size={17} />
          {busy ? "Loading…" : report ? "Refresh logs" : "Load logs"}
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
      {!enabled && (
        <p role="alert">
          Sign in to your private server in Settings to view connection logs.
        </p>
      )}
      {error && (
        <p role="alert" className="diagnostic-alert">
          {error} Try loading the logs again.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!report && busy && <p role="status">Loading connection logs…</p>}
      <form
        className="diagnostic-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...filters, search: query.trim() });
        }}
      >
        <label>
          Outcome
          <select
            value={filters.outcome}
            disabled={!enabled || busy}
            onChange={(event) =>
              setFilters({ ...filters, outcome: event.target.value })
            }
          >
            <option value="all">All requests</option>
            <option value="errors">Errors</option>
            <option value="completed">Completed</option>
            <option value="in_progress">Incomplete</option>
          </select>
        </label>
        <label>
          Tool
          <select
            value={filters.tool}
            disabled={!enabled || busy}
            onChange={(event) =>
              setFilters({ ...filters, tool: event.target.value })
            }
          >
            <option value="">All tools</option>
            {report?.tools?.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search requests
          <input
            type="search"
            value={query}
            maxLength={80}
            disabled={!enabled || busy}
            placeholder="Request ID, tool or error category"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="button compact"
          disabled={!enabled || busy}
          type="submit"
        >
          Search
        </button>
      </form>
      {report && (
        <div aria-busy={busy}>
          <details className="diagnostic-server">
            <summary>Server &amp; storage details</summary>
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
              <div>
                <dt>POST limit</dt>
                <dd>{report.environment.postMaxSize}</dd>
              </div>
              <div>
                <dt>Log storage</dt>
                <dd>
                  {mb(report.storage.bytes)} · {report.storage.retentionDays}{" "}
                  days · {report.storage.maxEvents.toLocaleString()} events
                  maximum
                </dd>
              </div>
            </dl>
            <p className="settings-note">
              Private SQLite storage, separate from your workspace. Manuscript
              text, passwords and tokens are excluded. PHP limits shown here
              apply to this report; request details show the limits at the time
              of the request.
            </p>
          </details>
          {!report.storage.available ? (
            <p role="alert">
              Private diagnostic storage is unavailable ({report.storage.issue}
              ). Check PDO SQLite support and the private directory’s
              permissions.
            </p>
          ) : (
            <>
              <p className="diagnostic-count" role="status">
                {report.totalRequests}{" "}
                {report.totalRequests === 1 ? "request" : "requests"} ·{" "}
                {report.totalEvents} events
                {filters.outcome !== "all" || filters.tool || filters.search
                  ? ` · filtered from ${report.totalRecordedRequests} requests`
                  : ""}
              </p>
              <p className="settings-note">
                Newest first. Times use this device’s timezone.
              </p>
              {!report.requests.length && (
                <div className="diagnostic-empty">
                  <Pulse size={32} />
                  <h2>
                    {report.totalRecordedRequests
                      ? "No matching requests"
                      : "No diagnostic requests recorded yet"}
                  </h2>
                  <p>
                    {report.totalRecordedRequests
                      ? "Try another outcome, tool or search term."
                      : report.recordingEnabled === false
                        ? "Recording is paused. Enable diagnostics before retrying the ChatGPT submission."
                        : "Try the ChatGPT submission, then refresh this report."}
                  </p>
                  {(filters.outcome !== "all" ||
                    filters.tool ||
                    filters.search) && (
                    <button
                      className="button compact"
                      disabled={busy}
                      onClick={() => {
                        setQuery("");
                        setFilters({ outcome: "all", tool: "", search: "" });
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
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
                      input{" "}
                      {request.inputBytes < 1048576
                        ? `${(request.inputBytes / 1024).toFixed(1)} KB`
                        : mb(request.inputBytes)}
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
                      <dl className="diagnostic-request-facts">
                        <div>
                          <dt>Request ID</dt>
                          <dd>
                            <code>{request.id}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Method</dt>
                          <dd>{request.method}</dd>
                        </div>
                        <div>
                          <dt>MCP revision</dt>
                          <dd>{request.revision || "Unavailable"}</dd>
                        </div>
                        <div>
                          <dt>Execution limit</dt>
                          <dd>
                            {request.maxExecutionSeconds === undefined
                              ? "Unavailable"
                              : request.maxExecutionSeconds
                                ? `${request.maxExecutionSeconds}s`
                                : "Unlimited"}
                          </dd>
                        </div>
                        <div>
                          <dt>Input counts</dt>
                          <dd>
                            {request.paragraphs ?? "—"} paragraphs ·{" "}
                            {request.replacements ?? "—"} replacements ·{" "}
                            {request.insertions ?? "—"} insertions
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="button quiet compact"
                        onClick={() =>
                          onCopy(
                            JSON.stringify(
                              { revision: report.revision, request },
                              null,
                              2,
                            ),
                          )
                        }
                      >
                        <Copy size={16} />
                        Copy request
                      </button>
                      <ol aria-label="Request timeline">
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
            confirm receipt by ChatGPT. Copy report includes this page and
            server details. Requests stopped before PHP starts cannot be
            recorded here.
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
    </main>
  );
}
