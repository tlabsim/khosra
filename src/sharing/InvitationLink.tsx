import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { request, ServerRequestError } from "../sync/client";
import type { Invitation } from "./contracts";

export default function InvitationLink({
  invitation,
  initialUrl,
  onSignIn,
}: {
  invitation: Invitation;
  initialUrl?: string;
  onSignIn: () => void;
}) {
  const [url, setUrl] = useState<string | null | undefined>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const signIn = useRef(onSignIn);
  signIn.current = onSignIn;
  const ended =
    invitation.revokedAt !== null || invitation.expiresAt * 1000 <= Date.now();

  useEffect(() => {
    active.current = true;
    if (ended || initialUrl)
      return () => {
        active.current = false;
      };
    let started = false;
    async function load() {
      if (started) return;
      started = true;
      try {
        const result = await request(`shares/${invitation.id}/link`);
        if (active.current)
          setUrl(z.string().url().nullable().parse(result.url));
      } catch (e) {
        if (!active.current) return;
        if (e instanceof ServerRequestError && e.status === 401)
          signIn.current();
        else
          setError(
            e instanceof Error ? e.message : "Could not load this link.",
          );
      }
    }
    // Load visible cards rather than requesting every invitation on a long page.
    if (typeof IntersectionObserver === "undefined") void load();
    else {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            void load();
          }
        },
        { rootMargin: "200px" },
      );
      if (container.current) observer.observe(container.current);
      return () => {
        active.current = false;
        observer.disconnect();
      };
    }
    return () => {
      active.current = false;
    };
  }, [invitation.id, ended, initialUrl]);

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request(path, body);
      if (active.current) {
        setUrl(z.string().url().nullable().parse(result.url));
        setConfirm(false);
        setCopied(false);
      }
    } catch (e) {
      if (!active.current) return;
      if (e instanceof ServerRequestError && e.status === 401) signIn.current();
      else
        setError(e instanceof Error ? e.message : "Could not load this link.");
    } finally {
      if (active.current) setBusy(false);
    }
  }

  if (ended) return null;
  return (
    <div ref={container} className="invitation-link">
      {url ? (
        <>
          <label htmlFor={`invitation-link-${invitation.id}`}>
            Private reading link
          </label>
          <div className="invitation-link-field">
            <input
              id={`invitation-link-${invitation.id}`}
              aria-label={`Reading link for ${invitation.recipient}`}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              className="button invitation-copy"
              disabled={busy}
              aria-label={`Copy link for ${invitation.recipient}`}
              onClick={() => {
                setError("");
                void navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    if (active.current) setCopied(true);
                  })
                  .catch(() => {
                    if (active.current)
                      setError("Select the link and copy it manually.");
                  });
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
            </button>
          </div>
        </>
      ) : url === null ? (
        <div className="invitation-link-legacy">
          {confirm ? (
            <>
              <p>
                This older link cannot be recovered. Replacing it disables the
                previous link and signs out its readers. Shared chapters, expiry
                and feedback stay the same.
              </p>
              <div className="sharing-invitation-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void run(`shares/${invitation.id}/replace-link`, {})
                  }
                >
                  <ArrowClockwise size={17} /> Confirm replace link
                </button>
                <button
                  className="button quiet"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                The original link wasn’t retained. Create a replacement to share
                this invitation again.
              </p>
              <button
                className="button quiet compact"
                onClick={() => setConfirm(true)}
              >
                <ArrowClockwise size={17} /> Replace link
              </button>
            </>
          )}
        </div>
      ) : (
        !error && (
          <p className="caption" role="status">
            Loading private link…
          </p>
        )
      )}
      {error && (
        <div className="invitation-link-error">
          <p className="sharing-error" role="alert">
            {error}
          </p>
          {!url && (
            <button
              className="button quiet compact"
              disabled={busy}
              onClick={() => void run(`shares/${invitation.id}/link`)}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
