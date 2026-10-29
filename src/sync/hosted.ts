import type { State } from "../domain/model";
import { reconcile } from "./reconcile";
import { ServerRequestError, SyncConflict } from "./client";

export class DeviceSaveError extends Error {}

export type RemoteWorkspace = { state: State; version: string };
export type HostedStatus = {
  phase: "checking" | "login" | "ready" | "adopt" | "unavailable";
  message: string;
  conflict?: boolean;
  offlineAvailable?: boolean;
};
export type HostedAdapter = {
  local: () => State;
  persist: () => Promise<void>;
  apply: (state: State, expected: string) => Promise<boolean>;
  canApply: () => boolean;
  baseline: () => Promise<string | undefined>;
  acknowledge: (remote: RemoteWorkspace) => Promise<void>;
  session: () => Promise<unknown>;
  login: (password: string) => Promise<unknown>;
  logout: () => Promise<unknown>;
  pull: () => Promise<RemoteWorkspace>;
  push: (state: State, version: string) => Promise<{ version: number }>;
  conflict: (remote: RemoteWorkspace) => void;
  status: (status: HostedStatus) => void;
};
const serialize = (state: State) => JSON.stringify(state);

/** One serialized sync actor. Acknowledgements always describe the exact sent/read state. */
export class HostedWorkspace {
  status: HostedStatus = {
    phase: "checking",
    message: "Connecting to your workspace…",
  };
  private authenticated = false;
  private closing = false;
  private stopped = false;
  private generation = 0;
  private busy: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued = false;
  private blocked: RemoteWorkspace | null = null;
  private adoption: RemoteWorkspace | null = null;
  private wasReady = false;
  constructor(private adapter: HostedAdapter) {}
  private show(status: HostedStatus) {
    if (
      !this.stopped &&
      !(this.closing && ["ready", "adopt"].includes(status.phase))
    ) {
      this.status = status;
      this.adapter.status(status);
    }
  }
  private live(generation: number) {
    return !this.stopped && generation === this.generation;
  }
  async start(password?: string) {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.show({
      phase: "checking",
      message:
        password === undefined
          ? "Connecting to your workspace…"
          : "Signing in…",
    });
    try {
      if (password === undefined) await this.adapter.session();
      else await this.adapter.login(password);
      if (!this.live(generation)) return;
      this.authenticated = true;
      this.blocked = null;
      this.adoption = null;
      // An earlier response may still be finishing; it cannot mutate this generation.
      await this.busy;
      if (this.live(generation)) await this.sync();
    } catch (error) {
      if (this.live(generation)) await this.failed(error);
    }
  }
  private async failed(error: unknown) {
    const generation = this.generation;
    if (error instanceof DeviceSaveError) {
      this.show({ phase: "unavailable", message: error.message });
    } else if (error instanceof ServerRequestError && error.status === 401) {
      this.authenticated = false;
      this.wasReady = false;
      this.show({
        phase: "login",
        message: error.message.includes("Incorrect")
          ? error.message
          : "Sign in to open your server workspace. Unsynced work on this device is retained.",
      });
    } else if (
      error instanceof ServerRequestError &&
      error.code === "server_not_configured"
    ) {
      this.authenticated = false;
      this.show({ phase: "unavailable", message: error.message });
    } else {
      const offlineAvailable = !!(await this.adapter.baseline());
      if (!this.live(generation)) return;
      this.show({
        phase: this.wasReady ? "ready" : "unavailable",
        message: this.wasReady
          ? "Saved on this device · waiting for server"
          : error instanceof ServerRequestError
            ? error.code === "invalid_response"
              ? `The server returned HTTP ${error.status} instead of a Khosra API response. Check API routing, file permissions and the server error log.`
              : `${error.message} (HTTP ${error.status}).`
            : "Could not reach your workspace. Check your connection and try again.",
        offlineAvailable,
      });
    }
  }
  notify() {
    if (this.stopped || this.blocked || this.adoption) return;
    if (this.status.phase === "ready")
      this.show({ phase: "ready", message: "Saving to server…" });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.sync();
    }, 900);
  }
  async sync(): Promise<void> {
    if (this.stopped || !this.authenticated || this.blocked || this.adoption)
      return;
    if (this.busy) {
      this.queued = true;
      return this.busy;
    }
    const generation = this.generation;
    this.busy = this.cycle(generation)
      .catch(async (error) => {
        if (this.live(generation)) await this.failed(error);
      })
      .finally(() => {
        this.busy = null;
        if (this.queued) {
          this.queued = false;
          this.notify();
        }
      });
    return this.busy;
  }
  private ready(message: string) {
    this.wasReady = true;
    this.show({ phase: "ready", message });
  }
  private review(remote: RemoteWorkspace) {
    this.blocked = remote;
    this.ready("Changes need review · both versions retained");
    this.show({ ...this.status, conflict: true });
    this.adapter.conflict(remote);
  }
  private async cycle(generation: number) {
    await this.adapter.persist();
    const remote = await this.adapter.pull();
    await this.adapter.persist();
    const baseline = await this.adapter.baseline();
    if (!this.live(generation)) return;
    const local = this.adapter.local(),
      localText = serialize(local),
      remoteText = serialize(remote.state);
    if (localText === remoteText) {
      await this.adapter.acknowledge(remote);
      if (this.live(generation))
        this.ready(
          serialize(this.adapter.local()) === localText
            ? "Saved to server"
            : "Saving to server…",
        );
      return;
    }
    if (
      local.books.length &&
      (!baseline ||
        (remote.version === "0" &&
          !remote.state.books.length &&
          baseline !== remoteText))
    ) {
      this.adoption = remote;
      this.show({
        phase: "adopt",
        message:
          "This device has a workspace that has not been linked to server autosave.",
      });
      return;
    }
    if ((!local.books.length && !baseline) || localText === baseline) {
      if (!this.adapter.canApply()) {
        this.ready(
          "Saved on this device · finish editing to sync server changes",
        );
        return;
      }
      if (await this.adapter.apply(remote.state, localText)) {
        if (!this.live(generation)) return;
        await this.adapter.acknowledge(remote);
        if (this.live(generation)) {
          const clean = serialize(this.adapter.local()) === remoteText;
          this.ready(clean ? "Saved to server" : "Saving to server…");
          if (!clean) this.queued = true;
        }
      } else this.queued = true;
      return;
    }
    if (baseline !== remoteText) {
      if (!this.adapter.canApply()) {
        this.ready(
          "Saved on this device · finish editing to sync server changes",
        );
        return;
      }
      const result = reconcile(local, remote.state);
      if (result.conflicts.length) {
        this.review(remote);
        return;
      }
      if (!(await this.adapter.apply(result.state, localText))) {
        this.queued = true;
        return;
      }
      if (!this.live(generation)) return;
    }
    const sending = this.adapter.local();
    this.ready("Saving to server…");
    try {
      const result = await this.adapter.push(sending, remote.version);
      if (!this.live(generation)) return;
      await this.adapter.acknowledge({
        state: sending,
        version: String(result.version),
      });
      if (!this.live(generation)) return;
      if (serialize(this.adapter.local()) !== serialize(sending)) {
        this.queued = true;
        this.ready("Saving to server…");
      } else this.ready("Saved to server");
    } catch (error) {
      if (error instanceof SyncConflict && this.live(generation)) {
        if (this.adapter.canApply()) this.review(await this.adapter.pull());
        else this.queued = true;
      } else throw error;
    }
  }
  async adopt() {
    const remote = this.adoption;
    if (!remote || !this.authenticated) return;
    this.adoption = null;
    if (remote.state.books.length) {
      this.review(remote);
      return;
    }
    await this.adapter.acknowledge(remote);
    await this.sync();
  }
  async resolve(state: State, remote: RemoteWorkspace) {
    if (!this.authenticated) return;
    const expected = serialize(this.adapter.local());
    if (!(await this.adapter.apply(state, expected))) return;
    await this.adapter.acknowledge(remote);
    this.blocked = null;
    await this.sync();
  }
  reviewAgain() {
    if (this.blocked) this.adapter.conflict(this.blocked);
  }
  async offline() {
    if (this.status.phase !== "unavailable" || !this.status.offlineAvailable)
      return;
    this.wasReady = true;
    this.ready("Offline copy · sign in when connected to sync");
  }
  async retry() {
    if (!this.authenticated) await this.start();
    else await this.sync();
  }
  async signOut() {
    this.closing = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.show({ phase: "checking", message: "Saving and signing out…" });
    try {
      await this.adapter.persist();
      await this.busy;
      if (
        this.authenticated &&
        !this.blocked &&
        serialize(this.adapter.local()) !== (await this.adapter.baseline())
      )
        await this.sync();
      const pending =
        serialize(this.adapter.local()) !== (await this.adapter.baseline());
      ++this.generation;
      clearTimeout(this.timer);
      await this.adapter.logout();
      this.authenticated = false;
      this.blocked = null;
      this.adoption = null;
      this.wasReady = false;
      this.show({
        phase: "login",
        message: pending
          ? "Signed out. Unsynced changes remain on this device and will resume after sign-in."
          : "Signed out. Sign in to open your workspace.",
      });
    } catch (error) {
      this.closing = false;
      await this.failed(error);
    } finally {
      this.closing = false;
    }
  }
  stop() {
    this.stopped = true;
    ++this.generation;
    clearTimeout(this.timer);
  }
}
