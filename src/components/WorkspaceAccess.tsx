import { useState, type FormEvent } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import AppLogo from "./AppLogo";
import type { HostedStatus } from "../sync/hosted";

export default function WorkspaceAccess({
  status,
  onLogin,
  onRetry,
  onAdopt,
  onOffline,
  onBackup,
}: {
  status: HostedStatus;
  onLogin: (password: string) => Promise<void>;
  onRetry: () => void;
  onAdopt: () => void;
  onOffline: () => void;
  onBackup: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      await onLogin(String(new FormData(form).get("password") || ""));
      form.reset();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace-access">
      <header className="access-masthead">
        <div className="access-brand">
          <AppLogo />
        </div>
        <span className="access-host">{window.location.host}</span>
      </header>
      <section className="access-layout" aria-labelledby="access-heading">
        <div className="access-intro">
          <h1 id="access-heading">
            {status.phase === "login"
              ? "Sign in"
              : status.phase === "adopt"
                ? "Bring your draft onto the server"
                : status.phase === "checking"
                  ? "Opening your workspace"
                  : "Workspace unavailable"}
          </h1>
          <p role="status">
            {status.phase === "login" &&
            status.message.startsWith("Sign in to open your server workspace.")
              ? "Continue to your manuscripts."
              : status.message}
          </p>
        </div>
        <div className="access-controls">
          {status.phase === "login" && (
            <form onSubmit={(event) => void login(event)}>
              <label htmlFor="workspace-password">Owner password</label>
              <input
                id="workspace-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                disabled={busy}
              />
              <button className="button primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <p className="caption">
                Your manuscripts stay in sync across your signed-in devices.
              </p>
            </form>
          )}
          {status.phase === "adopt" && (
            <>
              <p>
                Keep the draft already on this device. Save it to your server
                workspace, or review both versions if the server already
                contains work.
              </p>
              <div className="access-actions">
                <button className="button primary" onClick={onAdopt}>
                  Continue with this device’s draft
                </button>
                <button className="button" onClick={onBackup}>
                  Download device backup
                </button>
              </div>
            </>
          )}
          {status.phase === "unavailable" && (
            <div className="access-actions">
              <button className="button primary" onClick={onRetry}>
                Try again
              </button>
              <button className="button" onClick={onBackup}>
                Download device backup
              </button>
              {status.offlineAvailable && (
                <button className="button" onClick={onOffline}>
                  Open cached workspace offline
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
