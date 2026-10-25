import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { CloudSlash } from "@phosphor-icons/react/dist/csr/CloudSlash";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import type { Book, Chapter } from "../domain/model";
import { request, login, ServerRequestError } from "../sync/client";
import {
  invitationSchema,
  commentSchema,
  type Invitation,
  type ReaderComment,
} from "./contracts";
import Dialog from "./Dialog";
import Comments from "./Comments";
export default function Share({
  book,
  chapters,
  onClose,
  onSettings,
  onConnected,
}: {
  book: Book;
  chapters: Chapter[];
  onClose: () => void;
  onSettings: () => void;
  onConnected: () => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [connection, setConnection] = useState<
      "checking" | "signin" | "unavailable" | "ready"
    >("checking"),
    [notConfigured, setNotConfigured] = useState(false),
    [formOpen, setFormOpen] = useState(true),
    [password, setPassword] = useState(""),
    [recipient, setRecipient] = useState(""),
    [days, setDays] = useState(7),
    [selected, setSelected] = useState(chapters.map((c) => c.id)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [linkId, setLinkId] = useState(""),
    [copied, setCopied] = useState(false),
    [revokeId, setRevokeId] = useState(""),
    [feedbackId, setFeedbackId] = useState(""),
    [comments, setComments] = useState<ReaderComment[]>([]);
  const active = useRef(true);
  async function refresh() {
    const data = await request("shares?bookId=" + encodeURIComponent(book.id));
    if (active.current)
      setInvitations(z.array(invitationSchema).parse(data.invitations));
  }
  function unavailable(e: unknown) {
    if (!active.current) return;
    setNotConfigured(
      e instanceof ServerRequestError &&
        (e.code === "server_not_configured" ||
          (e.status === 503 && e.message.includes("not configured"))),
    );
    setConnection("unavailable");
    setError("");
  }
  async function checkConnection() {
    setConnection("checking");
    setError("");
    try {
      await request("session");
      await refresh();
      if (active.current) {
        setConnection("ready");
        onConnected();
      }
    } catch (e) {
      if (!active.current) return;
      if (e instanceof ServerRequestError && e.status === 401)
        setConnection("signin");
      else unavailable(e);
    }
  }
  useEffect(() => {
    active.current = true;
    void checkConnection();
    return () => {
      active.current = false;
    };
    // The selected manuscript is fixed for this dialog's lifetime.
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (!active.current) return;
      if (e instanceof ServerRequestError && e.status === 401) {
        setConnection("signin");
        setError(
          e.message.includes("Incorrect")
            ? "That password wasn’t recognised. Try again."
            : "Sign in again to manage your reading links.",
        );
      } else if (
        !(e instanceof ServerRequestError) ||
        e.status >= 500 ||
        e.code === "invalid_response"
      )
        unavailable(e);
      else setError(e.message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <Dialog
      title="Share for reading"
      onClose={onClose}
      context={
        <div className="sharing-manuscript">
          <span className="sharing-book-icon">
            <BookOpen size={23} />
          </span>
          <div>
            <strong>{book.title}</strong>
            <span>
              {selected.length === chapters.length
                ? "Entire manuscript"
                : "Selected chapters"}{" "}
              · {selected.length}{" "}
              {selected.length === 1 ? "chapter" : "chapters"}
            </span>
          </div>
        </div>
      }
      returnFocus={'button[aria-label="Chapter actions"]'}
    >
      {connection === "checking" ? (
        <p role="status" className="caption">
          Checking sharing…
        </p>
      ) : connection === "unavailable" ? (
        <section className="sharing-connection-state">
          <div className="sharing-state-heading">
            <CloudSlash size={22} aria-hidden="true" />
            <h3>
              {notConfigured
                ? "Sharing isn’t set up yet"
                : "Sharing is temporarily unavailable"}
            </h3>
          </div>
          <p>
            {notConfigured
              ? "Set up Khosra on your server, then upload your manuscript to create reading links."
              : "We couldn’t reach your Khosra sharing service. Try again or check your server settings."}
          </p>
          <p className="caption">You can keep writing on this device.</p>
          <div className="button-row">
            {notConfigured ? (
              <>
                <button className="button primary" onClick={onSettings}>
                  Server settings
                </button>
                <button
                  className="button"
                  onClick={() => {
                    void checkConnection();
                  }}
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <button
                  className="button primary"
                  onClick={() => {
                    void checkConnection();
                  }}
                >
                  Try again
                </button>
                <button className="button quiet" onClick={onSettings}>
                  Server settings
                </button>
              </>
            )}
          </div>
        </section>
      ) : connection === "signin" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await login(password);
              setPassword("");
              onConnected();
              await refresh();
              if (active.current) setConnection("ready");
            });
          }}
        >
          <div className="sharing-signin-intro">
            <h3>Sign in to manage reading links</h3>
            <p>
              Use your Khosra password. Guests only need their reading link.
            </p>
          </div>
          <label>
            Your Khosra password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <>
          {formOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const result = await request("shares", {
                    recipient: recipient.trim(),
                    expiresAt: Math.floor(Date.now() / 1000) + days * 86400,
                    bookId: book.id,
                    title: book.title,
                    language: book.language,
                    chapters: chapters
                      .filter((c) => selected.includes(c.id))
                      .map((c) => ({
                        id: c.id,
                        title: c.title,
                        headId: c.headId,
                      })),
                  });
                  setLink(z.string().url().parse(result.url));
                  setLinkId(z.string().uuid().parse(result.id));
                  setCopied(false);
                  setRecipient("");
                  setFormOpen(false);
                  await refresh();
                });
              }}
            >
              <div className="sharing-fields">
                <label>
                  Reader name
                  <input
                    value={recipient}
                    maxLength={100}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="e.g. Amina"
                    required
                  />
                </label>
                <label>
                  Expires in
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    {[1, 7, 14, 30, 90].map((d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? "day" : "days"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details className="sharing-chapters">
                <summary>
                  {selected.length === chapters.length
                    ? `Entire manuscript · ${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"}`
                    : `${selected.length} chapters selected`}
                </summary>
                <div className="sharing-scope-actions">
                  <button
                    type="button"
                    onClick={() => setSelected(chapters.map((c) => c.id))}
                  >
                    Select all
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    Clear selection
                  </button>
                </div>
                {chapters.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, c.id]
                            : selected.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.title}
                  </label>
                ))}
              </details>
              <p className="caption">
                Shares fixed, uploaded revisions. Later edits stay private.
              </p>
              <button
                className="button primary"
                disabled={busy || !selected.length}
              >
                <LinkSimple size={18} />
                Create reading link
              </button>
            </form>
          ) : (
            <button className="button" onClick={() => setFormOpen(true)}>
              New invitation
            </button>
          )}
          {link && (
            <div className="sharing-link" role="status">
              <label>
                Copy this link now
                <input
                  readOnly
                  value={link}
                  aria-label="Reading link"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                className="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Select the link and copy it manually."),
                    );
                }}
              >
                <Copy size={17} />
                {copied ? "Copied" : "Copy link"}
              </button>
              <small>
                Anyone with this link can read the selected chapters until it
                expires or you revoke it. The code is shown only once.
              </small>
            </div>
          )}
          {invitations.length > 0 && (
            <section className="sharing-invitations">
              <h3>Invitations</h3>
              {invitations.map((i) => {
                const ended =
                  i.revokedAt !== null || i.expiresAt * 1000 <= Date.now();
                return (
                  <article key={i.id}>
                    <div>
                      <strong>{i.recipient}</strong>
                      <small>
                        {i.chapterCount}{" "}
                        {i.chapterCount === 1 ? "chapter" : "chapters"} ·{" "}
                        {i.revokedAt
                          ? "Revoked"
                          : i.expiresAt * 1000 <= Date.now()
                            ? "Expired"
                            : `Until ${new Date(i.expiresAt * 1000).toLocaleDateString()}`}
                      </small>
                    </div>
                    <div className="sharing-invitation-actions">
                      <button
                        className="button quiet compact"
                        disabled={busy}
                        onClick={() => {
                          if (feedbackId === i.id) {
                            setFeedbackId("");
                            return;
                          }
                          void run(async () => {
                            const data = await request(
                              `shares/${i.id}/comments`,
                            );
                            setComments(
                              z.array(commentSchema).parse(data.comments),
                            );
                            setFeedbackId(i.id);
                          });
                        }}
                      >
                        Feedback
                      </button>
                      {!ended &&
                        (revokeId === i.id ? (
                          <>
                            <button
                              className="button quiet compact paragraph-delete"
                              disabled={busy}
                              onClick={() => {
                                void run(async () => {
                                  await request(`shares/${i.id}/revoke`, {});
                                  setRevokeId("");
                                  if (linkId === i.id) setLink("");
                                  await refresh();
                                });
                              }}
                            >
                              Confirm revoke
                            </button>
                            <button
                              className="button quiet compact"
                              onClick={() => setRevokeId("")}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="button quiet compact"
                            disabled={busy}
                            onClick={() => setRevokeId(i.id)}
                          >
                            Revoke
                          </button>
                        ))}
                    </div>
                    {feedbackId === i.id && <Comments comments={comments} />}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
      {connection === "ready" && (
        <button className="text-button" onClick={onSettings}>
          Server settings<small>Upload the latest manuscript</small>
        </button>
      )}
      {connection === "signin" && (
        <button className="text-button" onClick={onSettings}>
          Server settings
        </button>
      )}
    </Dialog>
  );
}
