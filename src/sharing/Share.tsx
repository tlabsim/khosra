import PaginatedList from "../components/PaginatedList";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { CloudSlash } from "@phosphor-icons/react/dist/csr/CloudSlash";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ChatCircleText } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { Prohibit } from "@phosphor-icons/react/dist/csr/Prohibit";
import InvitationLink from "./InvitationLink";
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
import PasswordInput from "../components/PasswordInput";
export default function Share({
  centralized = false,
  book,
  chapters,
  onClose,
  onSettings,
  onConnected,
}: {
  centralized?: boolean;
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
    [formOpen, setFormOpen] = useState(false),
    [password, setPassword] = useState(""),
    [recipient, setRecipient] = useState(""),
    [days, setDays] = useState(7),
    [selected, setSelected] = useState(chapters.map((c) => c.id)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [createdLinks, setCreatedLinks] = useState<Record<string, string>>({}),
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
              {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}{" "}
              · Private reader access
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
              ? centralized
                ? "Configure this Khosra server and sign in before creating reading links."
                : "Set up Khosra on your server, then upload your manuscript to create reading links."
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
          <label htmlFor="share-password">Your Khosra password</label>
          <PasswordInput
            id="share-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <>
          <div className="sharing-section-heading">
            <div>
              <h3>Reader invitations</h3>
              <p>
                Each invitation has its own private link and access settings.
              </p>
            </div>
            {invitations.length > 0 && !formOpen && (
              <button
                className="button primary compact"
                onClick={() => setFormOpen(true)}
              >
                <Plus size={18} /> Invite reader
              </button>
            )}
          </div>
          {(formOpen || invitations.length === 0) && (
            <form
              className="sharing-create-form"
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
                  const id = z.string().uuid().parse(result.id);
                  const url = z.string().url().parse(result.url);
                  setCreatedLinks((links) => ({ ...links, [id]: url }));
                  setRecipient("");
                  setFormOpen(false);
                  await refresh();
                });
              }}
            >
              <h4>Invite a reader</h4>
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
              <div className="sharing-create-actions">
                <button
                  className="button primary"
                  disabled={busy || !selected.length}
                >
                  <LinkSimple size={18} /> Create reading link
                </button>
                {invitations.length > 0 && (
                  <button
                    type="button"
                    className="button quiet"
                    disabled={busy}
                    onClick={() => setFormOpen(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
          {invitations.length > 0 && (
            <section className="sharing-invitations">
              <p className="sharing-list-count">
                {invitations.length}{" "}
                {invitations.length === 1 ? "invitation" : "invitations"}
              </p>
              <PaginatedList
                items={invitations}
                label="Invitation"
                noun="invitations"
                itemsClassName="sharing-invitation-list"
                onPageChange={() => {
                  setFeedbackId("");
                  setRevokeId("");
                }}
                renderItem={(i) => {
                  const ended =
                    i.revokedAt !== null || i.expiresAt * 1000 <= Date.now();
                  return (
                    <article
                      key={i.id}
                      className="invitation-card"
                      aria-label={`Invitation for ${i.recipient}`}
                    >
                      <header className="invitation-card-header">
                        <span className="invitation-avatar" aria-hidden="true">
                          {Array.from(
                            i.recipient.trim(),
                          )[0]?.toLocaleUpperCase()}
                        </span>
                        <div className="invitation-recipient">
                          <strong>{i.recipient}</strong>
                          <small>
                            {i.chapterCount}{" "}
                            {i.chapterCount === 1 ? "chapter" : "chapters"} ·{" "}
                            {i.revokedAt
                              ? "Access ended"
                              : `${ended ? "Expired" : "Expires"} ${new Date(i.expiresAt * 1000).toLocaleDateString()}`}
                          </small>
                        </div>
                        <span
                          className={`invitation-status ${ended ? "is-ended" : "is-active"}`}
                        >
                          {i.revokedAt
                            ? "Revoked"
                            : ended
                              ? "Expired"
                              : "Active"}
                        </span>
                      </header>
                      <InvitationLink
                        invitation={i}
                        initialUrl={createdLinks[i.id]}
                        onSignIn={() => setConnection("signin")}
                      />
                      <footer className="invitation-card-footer">
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
                            <ChatCircleText size={17} />{" "}
                            {feedbackId === i.id ? "Hide feedback" : "Feedback"}
                          </button>
                          {!ended &&
                            (revokeId === i.id ? (
                              <>
                                <button
                                  className="button quiet compact paragraph-delete"
                                  disabled={busy}
                                  onClick={() => {
                                    void run(async () => {
                                      await request(
                                        `shares/${i.id}/revoke`,
                                        {},
                                      );
                                      setRevokeId("");
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
                                <Prohibit size={17} /> Revoke
                              </button>
                            ))}
                        </div>
                      </footer>
                      {feedbackId === i.id && (
                        <Comments key={i.id} comments={comments} />
                      )}
                    </article>
                  );
                }}
              />
              <p className="sharing-access-note">
                Anyone with a link can use that invitation until it expires or
                you revoke it.
              </p>
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
          {centralized ? "Workspace settings" : "Server settings"}
          <small>
            {centralized
              ? "Check server save status"
              : "Upload the latest manuscript"}
          </small>
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
