import { useEffect, useRef, useState } from "react";
import AppLogo from "../components/AppLogo";
import { z } from "zod";
import { ChatCircleText } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import Reader from "../reader/Reader";
import Dialog from "./Dialog";
import Comments from "./Comments";
import { uid } from "../domain/model";
import {
  guestRequest,
  GuestRequestError,
  guestSessionSchema,
  sharedChapterSchema,
  commentSchema,
  type GuestSession,
  type SharedChapter,
  type ReaderComment,
} from "./contracts";
import "./sharing.css";
export default function Guest() {
  const [session, setSession] = useState<GuestSession | null>(null),
    [chapter, setChapter] = useState<SharedChapter | null>(null),
    [chapterId, setChapterId] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [feedback, setFeedback] = useState(false),
    [paragraphId, setParagraphId] = useState(""),
    [text, setText] = useState(""),
    [comments, setComments] = useState<ReaderComment[]>([]),
    [sending, setSending] = useState(false),
    [feedbackError, setFeedbackError] = useState("");
  const halted = useRef(false);
  const bound = useRef<string | undefined>(undefined);
  const retry = useRef<{
    text: string;
    chapterId: string;
    paragraphId: string;
    operationId: string;
  } | null>(null);
  function closeAccess(e: unknown) {
    halted.current = true;
    retry.current = null;
    setSession(null);
    setChapter(null);
    setComments([]);
    setFeedback(false);
    setText("");
    setLoading(false);
    setError(e instanceof Error ? e.message : "Reading access is unavailable.");
  }
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    history.replaceState(null, "", "/guest");
    function unavailable(e: unknown) {
      if (!live) return;
      closeAccess(e);
    }
    async function check(initial = false) {
      if (halted.current) return;
      try {
        if (initial && token) {
          const exchanged = await guestRequest(
            "exchange",
            { token },
            undefined,
            controller.signal,
          );
          bound.current = z.string().uuid().parse(exchanged.invitationId);
        }
        const data = guestSessionSchema.parse(
          await guestRequest(
            "session",
            undefined,
            undefined,
            controller.signal,
            bound.current,
          ),
        );
        bound.current = data.invitationId;
        if (!live || halted.current) return;
        setSession(data);
        setChapterId((id) => id || data.chapters[0].id);
        setLoading(false);
      } catch (e) {
        unavailable(e);
      }
    }
    void check(true);
    const timer = window.setInterval(() => {
      void check();
    }, 30000);
    const offline = () =>
      unavailable(
        new Error(
          "Reading requires an internet connection. Reconnect and try again.",
        ),
      );
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        closeAccess(new Error("This reading invitation has expired."));
      },
      Math.max(0, Math.min(2147483647, session.expiresAt * 1000 - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => {
    if (!session || !chapterId) return;
    const controller = new AbortController();
    setChapter(null);
    setParagraphId("");
    setText("");
    setFeedback(false);
    guestRequest(
      "chapter?id=" + encodeURIComponent(chapterId),
      undefined,
      undefined,
      controller.signal,
      session.invitationId,
    )
      .then((data) => {
        if (halted.current || controller.signal.aborted) return;
        setChapter(sharedChapterSchema.parse(data.chapter));
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          closeAccess(e);
        }
      });
    return () => controller.abort();
    // The immutable snapshot is fetched once per chapter, not on each access heartbeat.
  }, [chapterId, Boolean(session)]);
  async function openFeedback() {
    try {
      const data = await guestRequest(
        "comments",
        undefined,
        undefined,
        undefined,
        bound.current,
      );
      setComments(z.array(commentSchema).parse(data.comments));
      setFeedbackError("");
      setFeedback(true);
    } catch (e) {
      closeAccess(e);
    }
  }
  const index = session?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
  return (
    <div className="guest-app">
      <header className="guest-header">
        <span className="brand">
          <AppLogo />
        </span>
        <h1>{session?.title || "Private reading"}</h1>
        {session && (
          <div>
            <select
              aria-label="Chapter"
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
            >
              {session.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}. {c.title}
                </option>
              ))}
            </select>
            <button
              className="button quiet"
              disabled={!chapter}
              onClick={() => {
                void openFeedback();
              }}
            >
              <ChatCircleText size={20} />
              <span>Feedback</span>
            </button>
          </div>
        )}
      </header>
      {loading ? (
        <main className="guest-message" role="status">
          Opening your invitation…
        </main>
      ) : !session ? (
        <main className="guest-message">
          <h2>Reading unavailable</h2>
          <p>{error || "Open the reading link supplied by the author."}</p>
          <button className="button" onClick={() => location.reload()}>
            Try again
          </button>
        </main>
      ) : chapter ? (
        <Reader
          key={chapter.id}
          guest
          title={chapter.title}
          number={chapter.number}
          language={session.language}
          paragraphs={chapter.paragraphs}
          historical={false}
          previous={
            index > 0
              ? () => setChapterId(session.chapters[index - 1].id)
              : undefined
          }
          next={
            index < session.chapters.length - 1
              ? () => setChapterId(session.chapters[index + 1].id)
              : undefined
          }
        />
      ) : (
        <main className="guest-message" role="status">
          Loading chapter…
        </main>
      )}
      {feedback && chapter && session && (
        <Dialog title="Reader feedback" onClose={() => setFeedback(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) return;
              setSending(true);
              setFeedbackError("");
              const payload = {
                text: text.trim(),
                chapterId: chapter.id,
                paragraphId,
              };
              if (
                !retry.current ||
                retry.current.text !== payload.text ||
                retry.current.chapterId !== payload.chapterId ||
                retry.current.paragraphId !== payload.paragraphId
              )
                retry.current = { ...payload, operationId: uid() };
              void guestRequest(
                "comments",
                { ...retry.current, paragraphId: paragraphId || null },
                session.csrf,
                undefined,
                session.invitationId,
              )
                .then(async () => {
                  setText("");
                  retry.current = null;
                  const data = await guestRequest(
                    "comments",
                    undefined,
                    undefined,
                    undefined,
                    bound.current,
                  );
                  setComments(z.array(commentSchema).parse(data.comments));
                })
                .catch((e) => {
                  if (
                    !(e instanceof GuestRequestError) ||
                    ![409, 422, 429].includes(e.status)
                  ) {
                    closeAccess(e);
                    return;
                  }
                  setFeedbackError(
                    e instanceof Error
                      ? e.message
                      : "Feedback could not be sent.",
                  );
                })
                .finally(() => setSending(false));
            }}
          >
            <label>
              About
              <select
                value={paragraphId}
                onChange={(e) => setParagraphId(e.target.value)}
              >
                <option value="">This chapter</option>
                {chapter.paragraphs
                  .filter((p) => p.text.trim())
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      P{p.label} — {p.text.slice(0, 70)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Your thoughts
              <textarea
                value={text}
                maxLength={6000}
                rows={4}
                required
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={sending || !text.trim()}
            >
              {sending ? "Sending…" : "Send feedback"}
            </button>
          </form>
          {feedbackError && (
            <p role="alert" className="sharing-error">
              {feedbackError}
            </p>
          )}
          <h3>Feedback on this invitation</h3>
          <Comments comments={comments} />
        </Dialog>
      )}
    </div>
  );
}
