import { useEffect, useState } from "react";
import {
  Lightbulb,
  Image,
  Plus,
  PencilSimple,
  DownloadSimple,
  X,
} from "@phosphor-icons/react";
import { now, uid, validateState, type State } from "../domain/model";
import {
  FILE_LIMIT,
  FileSchema,
  WORKSPACE_FILE_LIMIT,
  fileBytes,
  materialHeads,
  type Material,
  type MaterialFile,
} from "../domain/materials";
import PaginatedList from "./PaginatedList";
import LazyDetails from "./LazyDetails";
import "./materials.css";
export type ContextSection = "context" | "idea" | "artifact";
export function ContextTabs({
  section,
  onChange,
}: {
  section: ContextSection;
  onChange: (s: ContextSection) => void;
}) {
  return (
    <nav className="material-tabs" aria-label="Context and materials">
      {(
        [
          ["context", "Context"],
          ["idea", "Ideas"],
          ["artifact", "Artifacts"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          className="button quiet"
          aria-current={section === id ? "page" : undefined}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
function downloadFile(f: MaterialFile) {
  const bytes = fileBytes(f);
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: "application/octet-stream",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function uploadFile(file: File, bookId: string): Promise<MaterialFile> {
  if (file.size > FILE_LIMIT) throw Error("Each file can be up to 2 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const mime =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.type;
  const f = {
    id: uid(),
    bookId,
    name: file.name.replace(/[/\\\x00-\x1f]/g, "_").slice(0, 200),
    mime,
    size: file.size,
    data: btoa(raw),
  } as MaterialFile;
  const parsed = FileSchema.parse(f);
  fileBytes(parsed);
  return parsed;
}
export default function Materials({
  state,
  bookId,
  kind,
  onSave,
  onEditing,
}: {
  state: State;
  bookId: string;
  kind: "idea" | "artifact";
  onSave: (fn: (s: State) => State) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [filter, setFilter] = useState("active"),
    [scope, setScope] = useState(""),
    [form, setForm] = useState<Material | null>(null),
    [error, setError] = useState(""),
    [upload, setUpload] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    onEditing(!!form);
    return () => onEditing(false);
  }, [!!form]);
  const rows = state.materials.filter(
    (m) => m.bookId === bookId && m.kind === kind,
  );
  const heads = materialHeads(rows);
  const count = new Map<string, number>();
  heads.forEach((m) => count.set(m.itemId, (count.get(m.itemId) || 0) + 1));
  const chapters = state.chapters.filter((c) => c.bookId === bookId);
  const visible = heads
    .filter(
      (m) =>
        (filter === "all" ||
          (filter === "active"
            ? !["discarded", "archived"].includes(m.status)
            : m.status === filter)) &&
        (!scope || m.chapterIds.includes(scope)),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  const used = state.files.reduce((n, f) => n + f.size, 0);
  function open(m?: Material) {
    const id = uid();
    setForm(
      m
        ? { ...m, chapterIds: [...m.chapterIds] }
        : {
            id,
            itemId: id,
            parentId: null,
            bookId,
            kind,
            title: "",
            body: "",
            chapterIds: [],
            status: kind === "idea" ? "idea" : "active",
            fileId: null,
            url: "",
            source: "author",
            createdAt: now(),
          },
    );
    setUpload(null);
    setError("");
  }
  async function save() {
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const file = upload ? await uploadFile(upload, bookId) : null;
      onSave((s) => {
        const existing = s.materials.find((m) => m.id === form.id);
        if (
          existing &&
          !materialHeads(s.materials).some((m) => m.id === existing.id)
        )
          throw Error(
            "This note changed. Cancel and reopen the latest version; your text remains here.",
          );
        const duplicate = file
          ? s.files.find(
              (f) =>
                f.bookId === bookId &&
                f.name === file.name &&
                f.mime === file.mime &&
                f.data === file.data,
            )
          : undefined;
        const attachment = duplicate || file;
        const m: Material = {
          ...form,
          title: form.title.trim(),
          id: existing ? uid() : form.id,
          parentId: existing ? existing.id : null,
          fileId: attachment?.id ?? form.fileId,
          source: "author",
          createdAt: now(),
        };
        return validateState({
          ...s,
          materials: [...s.materials, m],
          files: attachment && !duplicate ? [...s.files, attachment] : s.files,
        });
      });
      setForm(null);
      setUpload(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="materials"
      aria-label={kind === "idea" ? "Manuscript ideas" : "Manuscript artifacts"}
    >
      <div className="section-heading">
        <div>
          <h2>{kind === "idea" ? "Ideas" : "Artifacts"}</h2>
          <p className="muted">
            {kind === "idea"
              ? "Possibilities for this manuscript. You decide what becomes part of the story."
              : "Private maps, images, documents and reference links for this manuscript."}
          </p>
        </div>
        <button
          className="button primary"
          disabled={!!form}
          onClick={() => open()}
        >
          <Plus size={18} />
          Add {kind}
        </button>
      </div>
      {kind === "artifact" && (
        <p className="caption">
          PNG, JPEG, WebP or PDF · 2 MiB per file ·{" "}
          {(used / 1048576).toFixed(1)} of {WORKSPACE_FILE_LIMIT / 1048576} MiB
          used, including history. Included in full workspace backups; excluded
          from reader shares.
        </p>
      )}
      {form && (
        <form
          className="material-form"
          aria-label={kind === "idea" ? "Idea editor" : "Artifact editor"}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="section-heading">
            <h3>
              {state.materials.some((m) => m.id === form.id) ? "Edit" : "New"}{" "}
              {kind}
            </h3>
            <button
              className="icon"
              type="button"
              aria-label="Cancel editing"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              <X />
            </button>
          </div>
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={300}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            {kind === "idea" ? "Idea notes" : "Description and source"}
            <textarea
              rows={5}
              maxLength={100000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <div className="material-fields">
            <label>
              Status
              <select
                aria-label="Status"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as Material["status"],
                  })
                }
              >
                {(kind === "idea"
                  ? ["idea", "planned", "used", "discarded"]
                  : ["active", "archived"]
                ).map((v) => (
                  <option key={v} value={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Chapter links (optional)</legend>
              {chapters.length === 0 ? (
                <span className="caption">Manuscript-wide</span>
              ) : (
                <div className="material-chapter-links">
                  {chapters.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={form.chapterIds.includes(c.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            chapterIds: e.target.checked
                              ? [...form.chapterIds, c.id]
                              : form.chapterIds.filter((id) => id !== c.id),
                          })
                        }
                      />
                      C{c.code}: {c.title}
                      {c.deletedAt ? " (Trash)" : ""}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
          {kind === "artifact" && (
            <>
              <label>
                Reference URL (optional)
                <input
                  type="url"
                  maxLength={2000}
                  value={form.url}
                  placeholder="https://"
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </label>
              <label>
                {form.fileId
                  ? "Replace attachment (previous file stays in history)"
                  : "Attachment (optional)"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => setUpload(e.target.files?.[0] || null)}
                />
              </label>
              {form.fileId && (
                <button
                  type="button"
                  className="button quiet"
                  onClick={() => {
                    setForm({ ...form, fileId: null });
                    setUpload(null);
                  }}
                >
                  Remove attachment from this version
                </button>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="material-form-actions">
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "Saving…" : `Save ${kind}`}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="material-filters">
        <label>
          Show
          <select
            aria-label="Material status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "active",
              "all",
              ...(kind === "idea"
                ? ["idea", "planned", "used", "discarded"]
                : ["archived"]),
            ].map((v) => (
              <option key={v} value={v}>
                {v === "active" ? "Active" : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chapter
          <select
            aria-label="Material chapter"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">All chapters and manuscript-wide</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                C{c.code}: {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!visible.length && (
        <p className="material-empty">
          No {kind === "idea" ? "ideas" : "artifacts"} in this view.
        </p>
      )}
      <PaginatedList
        key={`${kind}:${filter}:${scope}`}
        items={visible}
        label={kind === "idea" ? "Idea" : "Artifact"}
        noun={kind === "idea" ? "ideas" : "artifacts"}
        renderItem={(m) => {
          const f = state.files.find((f) => f.id === m.fileId);
          const history = rows
            .filter((r) => r.itemId === m.itemId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return (
            <article className="material-card" key={m.id}>
              <div className="material-card-content">
                <div className="material-heading">
                  {kind === "idea" ? (
                    <Lightbulb size={22} aria-hidden="true" />
                  ) : (
                    <Image size={22} aria-hidden="true" />
                  )}
                  <h3>{m.title}</h3>
                  <span className="status-pill">{m.status}</span>
                </div>
                {(count.get(m.itemId) || 0) > 1 && (
                  <p className="material-conflict" role="status">
                    Concurrent versions retained. Compare the versions below
                    before deciding what to use.
                  </p>
                )}
                <p className="preserve">{m.body}</p>
                {m.url && (
                  <a href={m.url} target="_blank" rel="noopener noreferrer">
                    Open reference ↗
                  </a>
                )}
                {f && (
                  <div className="material-attachment">
                    {f.mime.startsWith("image/") && (
                      <img
                        loading="lazy"
                        src={`data:${f.mime};base64,${f.data}`}
                        alt={m.title}
                      />
                    )}
                    <button className="button" onClick={() => downloadFile(f)}>
                      <DownloadSimple size={18} />
                      {f.name}
                    </button>
                  </div>
                )}
                <p className="caption">
                  {m.chapterIds.length
                    ? m.chapterIds
                        .map((id) => {
                          const c = chapters.find((c) => c.id === id);
                          return c
                            ? `C${c.code}: ${c.title}${c.deletedAt ? " (Trash)" : ""}`
                            : "";
                        })
                        .join(" · ")
                    : "Manuscript-wide"}{" "}
                  ·{" "}
                  {m.source === "model"
                    ? "Added by a connected model"
                    : "Author"}{" "}
                  · {new Date(m.createdAt).toLocaleDateString()}
                </p>
                {history.length > 1 && (
                  <LazyDetails summary={`Version history (${history.length})`}>
                    {() => (
                      <PaginatedList
                        items={history}
                        label="Material history"
                        renderItem={(r) => (
                          <div className="material-history" key={r.id}>
                            <h4>
                              {r.title} · {r.status}
                            </h4>
                            <p className="preserve">{r.body}</p>
                            <small>
                              {new Date(r.createdAt).toLocaleString()} ·{" "}
                              {r.source}
                            </small>
                            {r.url && (
                              <p>
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Reference ↗
                                </a>
                              </p>
                            )}
                            {r.fileId && (
                              <button
                                className="button"
                                onClick={() =>
                                  downloadFile(
                                    state.files.find((f) => f.id === r.fileId)!,
                                  )
                                }
                              >
                                Download version attachment
                              </button>
                            )}
                          </div>
                        )}
                      />
                    )}
                  </LazyDetails>
                )}
              </div>
              <footer>
                <button
                  className="button quiet"
                  disabled={!!form}
                  onClick={() => open(m)}
                >
                  <PencilSimple size={18} />
                  Edit {kind}
                </button>
                <span className="caption">
                  {kind === "idea"
                    ? "Change status in Edit idea"
                    : "Archive or restore in Edit artifact"}
                </span>
              </footer>
            </article>
          );
        }}
      />
    </section>
  );
}
