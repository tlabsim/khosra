import { afterEach, expect, it, vi } from "vitest";
import {
  HostedWorkspace,
  DeviceSaveError,
  type HostedAdapter,
  type RemoteWorkspace,
} from "../src/sync/hosted";
import { ServerRequestError } from "../src/sync/client";
import {
  emptyState,
  uid,
  now,
  addChapter,
  commit,
  head,
  type State,
} from "../src/domain/model";
import { reconcile } from "../src/sync/reconcile";
function fixture() {
  const s = emptyState(),
    id = uid();
  s.books.push({
    id,
    title: "Book",
    premise: "",
    language: "bn",
    createdAt: now(),
  });
  return addChapter(s, id, "Chapter");
}
function edit(s: State, text: string) {
  const c = s.chapters[0],
    r = head(s, c);
  return commit(s, c.id, r.id, [{ ...r.paragraphs[0], text }], text);
}
const actors: HostedWorkspace[] = [];
afterEach(() => {
  actors.forEach((a) => a.stop());
  actors.length = 0;
});
function setup(
  local = emptyState(),
  remote: RemoteWorkspace = { state: fixture(), version: "1" },
  baseline?: State,
) {
  let current = local,
    server = remote,
    base = baseline ? JSON.stringify(baseline) : undefined;
  const adapter: HostedAdapter = {
    local: () => current,
    persist: vi.fn(async () => {}),
    canApply: () => true,
    apply: vi.fn(async (s, expected) => {
      if (JSON.stringify(current) !== expected) return false;
      current = s;
      return true;
    }),
    baseline: async () => base,
    acknowledge: vi.fn(async (r) => {
      base = JSON.stringify(r.state);
    }),
    session: vi.fn(async () => ({})),
    login: vi.fn(async () => ({})),
    logout: vi.fn(async () => ({})),
    pull: vi.fn(async () => server),
    push: vi.fn(async (s, v) => {
      expect(v).toBe(server.version);
      server = { state: s, version: String(Number(v) + 1) };
      return { version: Number(server.version) };
    }),
    conflict: vi.fn(),
    status: vi.fn(),
  };
  const actor = new HostedWorkspace(adapter);
  actors.push(actor);
  return {
    actor,
    adapter,
    local: () => current,
    setLocal: (s: State) => {
      current = s;
    },
    remote: () => server,
    setRemote: (r: RemoteWorkspace) => {
      server = r;
    },
    baseline: () => base,
  };
}
it("requires login before loading server prose", async () => {
  const t = setup();
  t.adapter.session = vi.fn(async () => {
    throw new ServerRequestError("Owner session required", 401);
  });
  await t.actor.start();
  expect(t.actor.status.phase).toBe("login");
  expect(t.adapter.pull).not.toHaveBeenCalled();
  expect(t.local().books).toEqual([]);
});
it("loads the server workspace on a fresh signed-in device", async () => {
  const t = setup();
  await t.actor.start();
  expect(t.local()).toEqual(t.remote().state);
  expect(t.actor.status.message).toBe("Saved to server");
  expect(t.adapter.push).not.toHaveBeenCalled();
});
it("asks before uploading an existing device-only manuscript", async () => {
  const local = fixture(),
    t = setup(local, { state: emptyState(), version: "0" });
  await t.actor.start();
  expect(t.actor.status.phase).toBe("adopt");
  expect(t.adapter.push).not.toHaveBeenCalled();
  await t.actor.adopt();
  expect(t.remote().state).toEqual(local);
  expect(t.actor.status.phase).toBe("ready");
});
it("keeps both existing workspaces for review when linking a device", async () => {
  const local = fixture(),
    t = setup(local);
  await t.actor.start();
  await t.actor.adopt();
  expect(t.adapter.conflict).toHaveBeenCalledWith(t.remote());
  expect(t.local()).toEqual(local);
  expect(t.adapter.push).not.toHaveBeenCalled();
  expect(t.actor.status.conflict).toBe(true);
});
it("automatically saves edits against the current server version", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "4" }, base);
  await t.actor.start();
  t.setLocal(edit(base, "নতুন লেখা।"));
  await t.actor.sync();
  expect(t.remote().state).toEqual(t.local());
  expect(t.remote().version).toBe("5");
  expect(t.actor.status.message).toBe("Saved to server");
});
it("refreshes remote changes without uploading an unchanged cache", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "4" }, base);
  await t.actor.start();
  const next = edit(base, "From another device");
  t.setRemote({ state: next, version: "5" });
  await t.actor.sync();
  expect(t.local()).toEqual(next);
  expect(t.adapter.push).not.toHaveBeenCalled();
});
it("defers incoming changes while a paragraph or dialog is active", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  t.adapter.canApply = () => false;
  t.setRemote({ state: edit(base, "Incoming"), version: "2" });
  await t.actor.sync();
  expect(t.local()).toEqual(base);
  t.adapter.canApply = () => true;
  await t.actor.sync();
  expect(t.local()).toEqual(t.remote().state);
});
it("retains a new local edit made during an in-flight upload", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  const sending = edit(base, "First"),
    later = edit(sending, "Later");
  t.setLocal(sending);
  const push = t.adapter.push;
  t.adapter.push = vi.fn(async (s, v) => {
    t.setLocal(later);
    return push(s, v);
  });
  await t.actor.sync();
  expect(t.remote().state).toEqual(sending);
  expect(t.local()).toEqual(later);
  expect(t.actor.status.message).toBe("Saving to server…");
  t.adapter.push = push;
  await t.actor.sync();
  expect(t.remote().state).toEqual(later);
});
it("preserves incoming model proposals alongside local prose edits", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  const c = base.chapters[0],
    r = head(base, c);
  const remote = {
    ...base,
    proposals: [
      {
        id: uid(),
        chapterId: c.id,
        baseRevisionId: r.id,
        title: "Suggestion",
        rationale: "Test",
        paragraphs: r.paragraphs,
        status: "pending" as const,
        createdAt: now(),
      },
    ],
  };
  t.setRemote({ state: remote, version: "2" });
  t.setLocal(edit(base, "Author edit"));
  await t.actor.sync();
  expect(t.local().proposals).toHaveLength(1);
  expect(
    head(t.remote().state, t.remote().state.chapters[0]).paragraphs[0].text,
  ).toBe("Author edit");
  expect(t.actor.status.conflict).not.toBe(true);
});
it("pauses divergent edits, retains both histories and saves after review", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  const local = edit(base, "Laptop"),
    remote = { state: edit(base, "Phone"), version: "2" };
  t.setLocal(local);
  t.setRemote(remote);
  await t.actor.sync();
  expect(t.actor.status.conflict).toBe(true);
  expect(t.adapter.push).not.toHaveBeenCalled();
  await t.actor.sync();
  expect(t.adapter.push).not.toHaveBeenCalled();
  const merged = reconcile(local, remote.state, {
    [base.chapters[0].id]: "local",
  }).state;
  await t.actor.resolve(merged, remote);
  expect(t.remote().state.revisions).toHaveLength(3);
  expect(
    head(t.remote().state, t.remote().state.chapters[0]).paragraphs[0].text,
  ).toBe("Laptop");
  expect(t.actor.status.conflict).not.toBe(true);
});
it("locks expired sessions without discarding pending edits", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  const local = edit(base, "Unsynced");
  t.setLocal(local);
  t.adapter.pull = vi.fn(async () => {
    throw new ServerRequestError("Expired", 401);
  });
  await t.actor.sync();
  expect(t.actor.status.phase).toBe("login");
  expect(t.local()).toEqual(local);
  expect(t.remote().state).toEqual(base);
});
it("keeps offline changes and uploads them after reconnection", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  const pull = t.adapter.pull;
  const local = edit(base, "Offline draft");
  t.setLocal(local);
  t.adapter.pull = vi.fn(async () => {
    throw new TypeError("Offline");
  });
  await t.actor.sync();
  expect(t.actor.status.message).toContain("waiting for server");
  expect(t.local()).toEqual(local);
  t.adapter.pull = pull;
  await t.actor.retry();
  expect(t.remote().state).toEqual(local);
});
it("only offers offline cache after a network failure, never after 401", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  t.adapter.session = vi.fn(async () => {
    throw new TypeError("Offline");
  });
  await t.actor.start();
  expect(t.actor.status.offlineAvailable).toBe(true);
  await t.actor.offline();
  expect(t.actor.status.phase).toBe("ready");
  t.adapter.session = vi.fn(async () => {
    throw new ServerRequestError("Expired", 401);
  });
  await t.actor.start();
  await t.actor.offline();
  expect(t.actor.status.phase).toBe("login");
});
it.each([404, 500, 200])(
  "identifies HTTP %i non-API responses without opening or changing the workspace",
  async (status) => {
    const local = fixture(),
      t = setup(local);
    t.adapter.session = vi.fn(async () => {
      throw new ServerRequestError(
        "Unexpected response",
        status,
        "invalid_response",
      );
    });
    await t.actor.start();
    expect(t.actor.status.phase).toBe("unavailable");
    expect(t.actor.status.message).toContain(`HTTP ${status}`);
    expect(t.actor.status.message).toContain("API routing");
    expect(t.local()).toEqual(local);
    expect(t.adapter.pull).not.toHaveBeenCalled();
    expect(t.adapter.push).not.toHaveBeenCalled();
  },
);
it("shows a structured server failure instead of calling it a connection failure", async () => {
  const t = setup();
  t.adapter.session = vi.fn(async () => {
    throw new ServerRequestError(
      "Server operation failed. No manuscript content was logged.",
      500,
    );
  });
  await t.actor.start();
  expect(t.actor.status.phase).toBe("unavailable");
  expect(t.actor.status.message).toContain("Server operation failed");
  expect(t.actor.status.message).toContain("HTTP 500");
  expect(t.adapter.push).not.toHaveBeenCalled();
});
it("blocks a changed browser cache rather than uploading a stale tab", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  t.adapter.persist = vi.fn(async () => {
    throw new DeviceSaveError("Another tab changed this workspace");
  });
  await t.actor.start();
  expect(t.actor.status.phase).toBe("unavailable");
  expect(t.adapter.pull).not.toHaveBeenCalled();
  expect(t.adapter.push).not.toHaveBeenCalled();
});
it("does not apply an old server response after sign out", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  let release!: (r: RemoteWorkspace) => void;
  t.adapter.pull = vi.fn(
    () =>
      new Promise<RemoteWorkspace>((r) => {
        release = r;
      }),
  );
  const cycle = t.actor.sync();
  await vi.waitFor(() => expect(release).toBeDefined());
  const logout = t.actor.signOut();
  release({ state: edit(base, "Late"), version: "2" });
  await Promise.all([cycle, logout]);
  expect(t.local()).toEqual(base);
  expect(t.actor.status.phase).toBe("login");
});

it("a network failure after session expiry cannot reopen the workspace automatically", async () => {
  const base = fixture(),
    t = setup(base, { state: base, version: "1" }, base);
  await t.actor.start();
  t.adapter.pull = vi.fn(async () => {
    throw new ServerRequestError("Expired", 401);
  });
  await t.actor.sync();
  expect(t.actor.status.phase).toBe("login");
  t.adapter.session = vi.fn(async () => {
    throw new TypeError("Offline");
  });
  await t.actor.start();
  expect(t.actor.status.phase).toBe("unavailable");
});

it("an unexpectedly empty reset server cannot erase the device recovery copy", async () => {
  const base = fixture(),
    t = setup(base, { state: emptyState(), version: "0" }, base);
  await t.actor.start();
  expect(t.actor.status.phase).toBe("adopt");
  expect(t.local()).toEqual(base);
  expect(t.adapter.apply).not.toHaveBeenCalled();
  await t.actor.adopt();
  expect(t.remote().state).toEqual(base);
  expect(t.actor.status.phase).toBe("ready");
});
