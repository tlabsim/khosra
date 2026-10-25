import { initializeAppearance } from "./appearance";
import {
  manuscriptChapters,
  trashChapter,
  restoreChapter,
} from "./domain/chapters";
import ChapterTrash from "./components/ChapterTrash";
import Guest from "./sharing/Guest";
import Share from "./sharing/Share";
import ShareIcon from "./components/ShareIcon";
import { historyGroups, historyTitle, visibleHead } from "./domain/history";
import {
  restoreParagraph,
  editionReferences,
} from "./domain/paragraphRecovery";
import ParagraphEditor from "./components/ParagraphEditor";
import {
  splitParagraph,
  joinParagraph,
  deleteParagraph,
  type ParagraphEdit,
} from "./domain/paragraphEditing";
import PasteChapter from "./components/PasteChapter";
import Settings from "./components/Settings";
import WorkspaceNav from "./components/WorkspaceNav";
import Reader from "./reader/Reader";
import Library from "./components/Library";
import SyncReview from "./components/SyncReview";
import History from "./components/History";
import Empty from "./components/Empty";
import ProposalReview from "./components/ProposalReview";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { BookBookmark } from "@phosphor-icons/react/dist/csr/BookBookmark";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { Notebook } from "@phosphor-icons/react/dist/csr/Notebook";
import { Flag as FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { TreeStructure } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { SpinnerGap } from "@phosphor-icons/react/dist/csr/SpinnerGap";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Leaf } from "@phosphor-icons/react/dist/csr/Leaf";
import { ChatCircleText } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { GitBranch } from "@phosphor-icons/react/dist/csr/GitBranch";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import {
  type State,
  type Book,
  type Chapter,
  type Paragraph,
  emptyState,
  uid,
  now,
  head,
  reference,
  commit,
  acceptProposal,
  addChapter,
  renumber,
  nextParagraphLabel,
  chapterReplacement,
  reincorporate,
  wordCount,
  validateState,
} from "./domain/model";
import {
  readState,
  saveState,
  exportBackup,
  importBackup,
  download,
  db,
} from "./storage/db";
import * as server from "./sync/client";
import "./style.css";
import "./desk.css";
import "./settings.css";
import "./chapter-actions.css";
import "./appearance.css";
type View =
  "manuscript" | "flags" | "review" | "history" | "context" | "settings";
function App() {
  const [state, setState] = useState<State>(emptyState),
    [loaded, setLoaded] = useState(false),
    [chapterId, setChapterId] = useState(""),
    [bookId, setBookId] = useState(""),
    [view, setView] = useState<View>("manuscript"),
    [reading, setReading] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState("Saved on this device"),
    [online, setOnline] = useState(navigator.onLine),
    [modal, setModal] = useState(""),
    [shareOpen, setShareOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [editText, setEditText] = useState(""),
    [editFocus, setEditFocus] = useState({ at: 0 }),
    [selection, setSelection] = useState<{ ids: string[]; quote: string }>({
      ids: [],
      quote: "",
    }),
    [historicalId, setHistoricalId] = useState(""),
    [proposalId, setProposalId] = useState(""),
    [scrolled, setScrolled] = useState(false),
    [serverReady, setServerReady] = useState(false);
  const [incoming, setIncoming] = useState<{
    state: State;
    version: string;
  } | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state),
    writeQueue = useRef(Promise.resolve()),
    importRef = useRef<HTMLInputElement>(null),
    session = useRef<{ chapterId: string; last: number; ids: string[] } | null>(
      null,
    );
  useEffect(() => {
    const scroll = () =>
      setScrolled((was) => (was ? window.scrollY > 24 : window.scrollY > 120));
    window.addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    readState()
      .then((s) => {
        latest.current = s;
        setState(s);
        setBookId(s.books[0]?.id || "");
        setChapterId(s.chapters[0]?.id || "");
        setLoaded(true);
      })
      .catch((e) => {
        setError(String(e));
        setLoaded(true);
      });
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const book = state.books.find((b) => b.id === bookId) || state.books[0];
  const chapters = manuscriptChapters(state, book?.id || "");
  const deletedChapters = state.chapters.filter(
    (c) => c.bookId === book?.id && c.deletedAt,
  );
  const chapter = chapters.find((c) => c.id === chapterId) || chapters[0];
  const current = chapter ? head(state, chapter) : undefined;
  const historical = state.revisions.find(
    (r) => r.id === historicalId && r.chapterId === chapter?.id,
  );
  const displayed = historical || current;
  const chapterRevisions = state.revisions.filter(
    (r) => r.chapterId === chapter?.id,
  );
  const recentHistory = historyGroups(chapterRevisions).slice(0, 3);
  const visibleCurrentId = current
    ? visibleHead(chapterRevisions, current.id)
    : "";
  const flags = state.flags.filter((f) => f.chapterId === chapter?.id);
  const pending = state.proposals.filter(
    (p) => p.status === "pending" && chapters.some((c) => c.id === p.chapterId),
  );
  const context = state.contexts
    .filter((x) => x.chapterId === chapter?.id)
    .at(-1);
  const contentParagraphs =
    displayed?.paragraphs.filter((p) => p.text.trim() || p.section.trim())
      .length || 0;
  const hasProse = !!displayed?.paragraphs.some(
    (p) => p.text.trim() || p.section.trim(),
  );
  const words = displayed
    ? wordCount(displayed.paragraphs.map((p) => p.text).join(" "))
    : 0;
  function update(next: State) {
    try {
      validateState(next);
      latest.current = next;
      setState(next);
      setSaveStatus("Saving locally…");
      writeQueue.current = writeQueue.current
        .then(() => saveState(next))
        .then(() => setSaveStatus("Saved on this device"))
        .catch((e) => {
          setSaveStatus("Save failed — export a backup");
          setError(String(e));
        });
    } catch (e) {
      setError(String(e));
    }
  }
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Reference copied");
    } catch {
      setError("Clipboard unavailable. Copy this reference: " + text);
    }
  }
  function choose(c: Chapter) {
    setChapterId(c.id);
    setHistoricalId("");
    setEditing(null);
    setSidebar(false);
    setSelection({ ids: [], quote: "" });
  }
  function openBook(b: Book) {
    setBookId(b.id);
    const first = latest.current.chapters
      .filter((c) => c.bookId === b.id && !c.deletedAt)
      .sort((a, b) => a.position - b.position)[0];
    setChapterId(first?.id || "");
    setLibraryOpen(false);
    setView("manuscript");
    setReading(false);
    setHistoricalId("");
    setSidebar(false);
    setEditing(null);
  }
  function manualEdit(p: Paragraph) {
    setEditing(p.id);
    setEditText(p.text);
    setEditFocus({ at: p.text.length });
    setSelection({ ids: [], quote: "" });
  }
  function saveParagraph(p: Paragraph, text: string) {
    if (!chapter) return;
    const s = latest.current,
      c = s.chapters.find((c) => c.id === chapter.id)!;
    const r = head(s, c);
    const existing = r.paragraphs.find((x) => x.id === p.id);
    if (!existing || existing.text === text) return;
    const t = Date.now();
    if (
      !session.current ||
      session.current.chapterId !== c.id ||
      t - session.current.last > 15 * 60 * 1000
    )
      session.current = { chapterId: c.id, last: t, ids: [now()] };
    session.current.last = t;
    update(
      commit(
        s,
        c.id,
        r.id,
        r.paragraphs.map((x) => (x.id === p.id ? { ...x, text } : x)),
        `Author session ${session.current.ids[0]}`,
      ),
    );
  }
  function finishParagraph(p: Paragraph) {
    if (editTimer.current) clearTimeout(editTimer.current);
    saveParagraph(p, editText);
    setEditing(null);
  }
  function changeParagraph(
    p: Paragraph,
    operation: (ps: Paragraph[], label: number) => ParagraphEdit | null,
    message: string,
  ): boolean {
    let changed = false;
    act(() => {
      if (editTimer.current) clearTimeout(editTimer.current);
      saveParagraph(p, editText);
      const s = latest.current,
        c = s.chapters.find((x) => x.id === chapter!.id)!,
        r = head(s, c);
      const result = operation(r.paragraphs, nextParagraphLabel(s, c));
      if (!result) return;
      update(commit(s, c.id, r.id, result.paragraphs, message));
      setEditing(result.activeId);
      setEditText(
        result.paragraphs.find((x) => x.id === result.activeId)?.text || "",
      );
      setEditFocus({ at: result.caret });
      changed = true;
    });
    return changed;
  }
  function addParagraph(after?: string) {
    if (!chapter || !current) return;
    const p = {
      id: uid(),
      label: nextParagraphLabel(state, chapter),
      text: "",
      section: "",
    };
    const ps = [...current.paragraphs];
    ps.splice(
      after ? ps.findIndex((p) => p.id === after) + 1 : ps.length,
      0,
      p,
    );
    update(commit(state, chapter.id, current.id, ps, "Paragraph inserted"));
    setEditing(p.id);
    setEditText("");
    setEditFocus({ at: 0 });
  }
  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const start = sel.anchorNode?.parentElement?.closest("[data-paragraph]"),
      end = sel.focusNode?.parentElement?.closest("[data-paragraph]");
    if (!start || !end || !displayed) return;
    const a = displayed.paragraphs.findIndex(
        (p) => p.id === start.getAttribute("data-paragraph"),
      ),
      b = displayed.paragraphs.findIndex(
        (p) => p.id === end.getAttribute("data-paragraph"),
      );
    setSelection({
      ids: displayed.paragraphs
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .map((p) => p.id),
      quote: sel.toString(),
    });
  }
  async function upload() {
    try {
      await writeQueue.current;
      await server.push(latest.current);
      setNotice("Workspace uploaded");
    } catch (e) {
      if (e instanceof server.SyncConflict) {
        try {
          const remote = await server.pull();
          setIncoming(remote);
          setModal("syncConflict");
        } catch (problem) {
          setError(String(problem));
        }
      } else setError(String(e));
    }
  }
  async function backup() {
    await writeQueue.current;
    download(
      await exportBackup(latest.current),
      "khosra-" + new Date().toISOString().slice(0, 10) + ".json",
    );
    setNotice("Full-history backup downloaded");
  }
  async function restoreFile(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = await importBackup(text);
      await backup();
      update(imported);
      setLibraryOpen(false);
      setBookId(imported.books[0]?.id || "");
      setChapterId(imported.chapters[0]?.id || "");
      setNotice("Archive restored. Previous workspace backup downloaded.");
    } catch (e) {
      setError(String(e));
    }
    if (importRef.current) importRef.current.value = "";
  }
  function newBook(form: FormData) {
    const id = uid();
    let s: State = {
      ...state,
      books: [
        ...state.books,
        {
          id,
          title: String(form.get("title")).trim(),
          premise: String(form.get("premise")),
          language: form.get("language") === "en" ? "en" : "bn",
          createdAt: now(),
        },
      ],
    };
    s = addChapter(s, id, "Untitled chapter");
    update(s);
    setBookId(id);
    setLibraryOpen(false);
    setChapterId(s.chapters.at(-1)!.id);
    setModal("");
    setView("manuscript");
  }
  function submitFlag(form: FormData) {
    if (!chapter || !displayed) return;
    update({
      ...state,
      flags: [
        ...state.flags,
        {
          id: uid(),
          number: Math.max(0, ...state.flags.map((f) => f.number)) + 1,
          chapterId: chapter.id,
          revisionId: displayed.id,
          paragraphIds: selection.ids,
          quote: selection.quote,
          note: String(form.get("note")),
          kind: form.get("kind") as "rewrite",
          status: "open",
          createdAt: now(),
        },
      ],
    });
    setModal("");
    setSelection({ ids: [], quote: "" });
    setNotice("Flag saved. Ready to discuss with ChatGPT.");
  }
  function reindexRequest() {
    if (!chapter || !current) return;
    void copy(
      `Reindex chapter ${reference(chapter, current)} (chapter_id ${chapter.id}). Read latest revision ${current.id}, then save a context index at approximately 20% of the chapter length. Include events, characters, timeline, clues and unresolved threads with paragraph UUID evidence. Distinguish explicit facts, character beliefs, reader knowledge, and interpretation. Use Khosra tools; save against the exact source revision.`,
    );
    setNotice(
      "Reindex instruction copied. Run it in your connected ChatGPT conversation.",
    );
  }
  const settingsReturn = useRef({
    view: "manuscript" as View,
    reading: false,
    libraryOpen: false,
  });
  function leaveSettings() {
    const destination = settingsReturn.current;
    setView(destination.view);
    setReading(destination.reading);
    setLibraryOpen(destination.libraryOpen);
    setSidebar(false);
  }
  function changeView(v: View) {
    if (v === "settings") {
      if (view === "settings" && !libraryOpen && !reading) {
        leaveSettings();
        return;
      }
      settingsReturn.current = {
        view: view === "settings" ? "manuscript" : view,
        reading,
        libraryOpen: libraryOpen || !book,
      };
    }
    setLibraryOpen(false);
    setView(v);
    setReading(false);
    setSidebar(false);
  }
  const tabs: [View, string, React.ElementType][] = [
    ["manuscript", "Manuscript", Notebook],
    ["flags", "Flags", FlagIcon],
    ["review", "Proposals", GitBranch],
    ["history", "History", ClockCounterClockwise],
    ["context", "Context", TreeStructure],
  ];
  if (!loaded)
    return (
      <div className="loading">
        <Leaf size={36} />
        <p>Opening your writing room…</p>
      </div>
    );
  return (
    <div className={"app " + (reading ? "reading" : "")}>
      {sidebar && book && !reading && !libraryOpen && (
        <>
          <button
            aria-label="Close navigation"
            className="contents-scrim"
            onClick={() => setSidebar(false)}
          />
          <aside
            className="contents-drawer"
            id="chapter-contents"
            aria-label="Chapter contents"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSidebar(false);
            }}
          >
            <div className="contents-heading">
              <h2>Contents</h2>
              <button
                className="icon"
                aria-label="Close contents"
                onClick={() => setSidebar(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="contents-book-title" lang={book.language}>
              <BookBookmark size={20} aria-hidden="true" />
              <span>{book.title}</span>
            </p>
            <div className="chapter-list">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  className={c.id === chapter?.id ? "selected" : ""}
                  onClick={() => {
                    choose(c);
                    changeView("manuscript");
                  }}
                >
                  <span className="chapter-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {c.title}
                    <small>
                      {c.approvedId === c.headId ? "Approved" : "Working draft"}{" "}
                      · C{c.code}
                    </small>
                  </span>
                  {c.id === chapter?.id && <BookmarkSimple size={16} />}
                </button>
              ))}
            </div>
            {!chapters.length && <p className="muted">No chapters yet.</p>}
            <button
              className="button quiet"
              onClick={() => {
                setSidebar(false);
                setModal("chapter");
              }}
            >
              <Plus size={18} />
              Add chapter
            </button>
            {!!deletedChapters.length && (
              <button
                className="button quiet contents-trash"
                onClick={() => {
                  setSidebar(false);
                  setModal("chapterTrash");
                }}
              >
                <Trash size={18} />
                Deleted chapters <span>{deletedChapters.length}</span>
              </button>
            )}
            <button
              className="contents-library"
              onClick={() => {
                setLibraryOpen(true);
                setReading(false);
                setSidebar(false);
              }}
            >
              <Books size={19} aria-hidden="true" />
              Back to library
            </button>
          </aside>
        </>
      )}
      <div className="main-shell">
        <header
          className={"topbar desk-header" + (scrolled ? " is-scrolled" : "")}
        >
          <div className="desk-home">
            <a
              className="brand"
              href="#"
              aria-label="Khosra library"
              onClick={(e) => {
                e.preventDefault();
                setLibraryOpen(true);
                setReading(false);
                setSidebar(false);
              }}
            >
              <span className="brand-mark">
                <Leaf size={23} weight="fill" />
              </span>
              khosra<span className="brand-dot">.</span>
            </a>
            <button
              className={
                "library-link " +
                (libraryOpen || (!book && view !== "settings") ? "active" : "")
              }
              aria-current={
                libraryOpen || (!book && view !== "settings")
                  ? "page"
                  : undefined
              }
              onClick={() => {
                setLibraryOpen(true);
                setReading(false);
                setSidebar(false);
              }}
            >
              <Books size={20} weight="regular" />
              <span>Library</span>
            </button>
            {book && !libraryOpen && view !== "settings" && !reading && (
              <CaretRight
                className="workspace-hierarchy"
                size={18}
                weight="regular"
                aria-hidden="true"
              />
            )}
          </div>
          {book && !libraryOpen && view !== "settings" && !reading && (
            <button
              className="contents-toggle"
              aria-label="Open navigation"
              aria-controls="chapter-contents"
              aria-expanded={sidebar}
              onClick={() => setSidebar(!sidebar)}
            >
              <List size={19} />
              <span>{book.title}</span>
              <span className="contents-label">Contents</span>
            </button>
          )}
          {reading && book && !libraryOpen && (
            <div className="reading-book-title" title={book.title}>
              {book.title}
            </div>
          )}
          <div className="topbar-actions">
            {!reading && book && !libraryOpen && (
              <span
                className={`saved ${saveStatus === "Saved on this device" ? "is-saved" : saveStatus.startsWith("Saving") ? "is-saving" : "is-failed"}`}
                tabIndex={0}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {saveStatus === "Saved on this device" ? (
                  <Check size={16} aria-hidden="true" />
                ) : saveStatus.startsWith("Saving") ? (
                  <SpinnerGap size={16} aria-hidden="true" />
                ) : (
                  <WarningCircle size={16} aria-hidden="true" />
                )}
                <span className="saved-label">{saveStatus}</span>
              </span>
            )}
            {!online && <span className="offline-status">Offline</span>}
            <button
              className="icon"
              aria-label="Settings & backups"
              aria-pressed={view === "settings" && !libraryOpen}
              title="Settings & backups"
              onClick={() => changeView("settings")}
            >
              <SlidersHorizontal size={20} weight="regular" />
            </button>
            {book && !libraryOpen && (
              <button
                className="icon"
                aria-label="Export backup"
                onClick={() => void backup().catch((e) => setError(String(e)))}
              >
                <DownloadSimple size={20} weight="regular" />
              </button>
            )}
            {chapter && !libraryOpen && view !== "settings" && (
              <button
                className={reading ? "button workspace-return" : "button quiet"}
                aria-label={reading ? "Back to workspace" : "Read"}
                onClick={() => {
                  setReading(!reading);
                  setEditing(null);
                  setSidebar(false);
                }}
              >
                {reading ? (
                  <PencilSimple size={20} weight="regular" />
                ) : (
                  <BookOpen size={20} weight="regular" />
                )}
                <span>{reading ? "Workspace" : "Read"}</span>
              </button>
            )}
          </div>
        </header>
        {!reading && book && !libraryOpen && view !== "settings" && (
          <WorkspaceNav
            onShare={() => setShareOpen(true)}
            onAddChapter={() => setModal("chapter")}
            current={view}
            onChange={(id) => changeView(id as View)}
            items={tabs.map(([id, label, icon]) => ({
              id,
              label,
              icon,
              count:
                id === "review"
                  ? pending.length
                  : id === "flags"
                    ? flags.filter((f) => f.status === "open").length
                    : 0,
            }))}
          />
        )}
        {error && (
          <div className="error" role="alert">
            <WarningCircle size={22} />
            <span>{error}</span>
            <button
              className="icon"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}
        {libraryOpen || (!book && view !== "settings") ? (
          <Library
            state={state}
            onOpen={openBook}
            onCreate={() => setModal("book")}
            onRestore={() => importRef.current?.click()}
          />
        ) : view === "settings" && !reading ? (
          <Settings
            backLabel={
              settingsReturn.current.libraryOpen
                ? "Back to library"
                : settingsReturn.current.reading
                  ? "Back to reading"
                  : "Back to workspace"
            }
            onBack={leaveSettings}
            bookTitle={book?.title}
            serverReady={serverReady}
            onConnect={async (password) => {
              await server.login(password);
              setServerReady(true);
              setNotice("Connected to private server");
            }}
            onDisconnect={() => {
              void server
                .request("logout", {})
                .then(() => {
                  setServerReady(false);
                  setNotice("Server session ended");
                })
                .catch((e) => setError(String(e)));
            }}
            onUpload={() => void upload()}
            onPull={() => setModal("pull")}
            onBackup={() => void backup().catch((e) => setError(String(e)))}
            onRestore={() => importRef.current?.click()}
            onExport={() =>
              download(
                chapters
                  .map(
                    (c) =>
                      `# ${c.title}\n\n${head(state, c)
                        .paragraphs.map((p) =>
                          p.section ? `## ${p.section}\n\n${p.text}` : p.text,
                        )
                        .join("\n\n")}`,
                  )
                  .join("\n\n"),
                "manuscript.md",
                "text/markdown",
              )
            }
            onCopy={(text) => void copy(text)}
            onError={setError}
          />
        ) : !chapter ? (
          <main className="page no-chapters">
            <Empty
              icon={Notebook}
              title={
                view === "flags"
                  ? "No chapter to flag"
                  : view === "review"
                    ? "No chapter to revise"
                    : view === "context"
                      ? "No chapter to index"
                      : view === "history"
                        ? "No chapter history yet"
                        : "No chapters yet"
              }
              text="Add a chapter to this manuscript to get started."
            >
              <button
                className="button primary"
                onClick={() => setModal("chapter")}
              >
                <Plus />
                Add chapter
              </button>
            </Empty>
          </main>
        ) : reading ? (
          <Reader
            key={`${chapter.id}:${displayed?.id}`}
            title={chapter.title}
            number={chapters.indexOf(chapter) + 1}
            language={book.language}
            paragraphs={displayed?.paragraphs || []}
            historical={!!historical}
            previous={
              chapters.indexOf(chapter) > 0
                ? () => choose(chapters[chapters.indexOf(chapter) - 1])
                : undefined
            }
            next={
              chapters.indexOf(chapter) < chapters.length - 1
                ? () => choose(chapters[chapters.indexOf(chapter) + 1])
                : undefined
            }
          />
        ) : (
          <>
            <div className="chapter-banner">
              <div>
                <div className="eyebrow">
                  CHAPTER{" "}
                  {String(chapters.indexOf(chapter) + 1).padStart(2, "0")}{" "}
                </div>
                <button
                  className="title-button"
                  aria-label="Rename chapter"
                  onClick={() => setModal("rename")}
                >
                  <h1>{chapter.title}</h1>
                  <span className="rename-chapter">
                    <PencilSimple size={16} />
                    <span className="rename-caption">Rename</span>
                  </span>
                </button>
                <div className="chapter-meta">
                  <span className="status-pill">
                    {chapter.approvedId === chapter.headId
                      ? "Approved"
                      : "Working draft"}
                  </span>
                  <span>{words.toLocaleString()} words</span>
                  <span>
                    {contentParagraphs}{" "}
                    {contentParagraphs === 1 ? "paragraph" : "paragraphs"}
                  </span>
                  <span>{reference(chapter, displayed!)}</span>
                </div>
              </div>
              <div className="button-row">
                <button
                  className="button"
                  onClick={() => {
                    setSelection({ ids: [], quote: "" });
                    setModal("flag");
                  }}
                >
                  <FlagIcon size={18} />
                  Add flag
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    void copy(
                      `Book: ${book.title}\nChapter: ${reference(chapter, current!)}\nchapter_id: ${chapter.id}\nrevision_id: ${current!.id}\nUse Khosra tools to retrieve the latest chapter or selected passages. Save revisions as proposals for author review.`,
                    )
                  }
                >
                  <ChatCircleText size={18} />
                  Discuss in ChatGPT
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
            {historical && (
              <div className="history-banner">
                <ClockCounterClockwise />
                Viewing {new Date(historical.createdAt).toLocaleString()} ·{" "}
                {historical.message}
                <button
                  className="button quiet"
                  onClick={() => setHistoricalId("")}
                >
                  Return to current
                </button>
              </div>
            )}
            {view === "manuscript" ? (
              <div className="writing-layout">
                <main className="manuscript-column">
                  <div className="document-toolbar">
                    <span>
                      <Notebook size={17} />{" "}
                      {historical ? "Historical manuscript" : "Manuscript"}
                    </span>
                    <div>
                      <button
                        className="button quiet compact"
                        onClick={() => setModal("jump")}
                      >
                        <MagnifyingGlass size={17} />
                        Jump to reference
                      </button>
                      <button
                        className="icon"
                        aria-label="Chapter actions"
                        onClick={() => setModal("actions")}
                      >
                        <DotsThree size={23} />
                      </button>
                    </div>
                  </div>
                  <article
                    className="paper"
                    lang={book.language}
                    onMouseUp={captureSelection}
                    onTouchEnd={() => setTimeout(captureSelection, 100)}
                  >
                    <div className="paper-heading">
                      <span>
                        CHAPTER{" "}
                        {String(chapters.indexOf(chapter) + 1).padStart(2, "0")}
                      </span>
                      <h2>{chapter.title}</h2>
                      <div className="paper-rule" />
                    </div>
                    {!hasProse && !editing && (
                      <Empty
                        compact
                        icon={PencilSimple}
                        title={
                          historical
                            ? "This revision is empty"
                            : "This chapter is empty"
                        }
                        text={
                          historical
                            ? undefined
                            : "Write directly or paste an existing draft."
                        }
                      >
                        {!historical && (
                          <>
                            <button
                              className="button primary"
                              onClick={() => {
                                const first = current!.paragraphs[0];
                                if (first) manualEdit(first);
                                else addParagraph();
                              }}
                            >
                              <PencilSimple />
                              Write first paragraph
                            </button>
                            <button
                              className="button quiet"
                              onClick={() => setModal("paste")}
                            >
                              <UploadSimple />
                              Paste chapter text
                            </button>
                          </>
                        )}
                      </Empty>
                    )}
                    {(hasProse || editing) &&
                      displayed?.paragraphs.map((p) => (
                        <div
                          className={
                            "paragraph-row " +
                            (selection.ids.includes(p.id) ? "highlighted" : "")
                          }
                          key={p.id}
                          id={"p-" + p.id}
                          data-paragraph={p.id}
                        >
                          <button
                            className="paragraph-id"
                            title="Copy permanent passage reference"
                            onClick={() =>
                              void copy(
                                `${reference(chapter, displayed, p)} [revision ${displayed.id}; paragraph ${p.id}]`,
                              )
                            }
                          >
                            P{p.label}
                          </button>
                          <div className="paragraph-content">
                            {p.section && <h3>{p.section}</h3>}
                            {editing === p.id && !historical ? (
                              <ParagraphEditor
                                key={p.id}
                                label={p.label}
                                value={editText}
                                focus={editFocus}
                                onChange={(value) => {
                                  setEditText(value);
                                  if (editTimer.current)
                                    clearTimeout(editTimer.current);
                                  editTimer.current = setTimeout(
                                    () => saveParagraph(p, value),
                                    650,
                                  );
                                }}
                                onClear={() => {
                                  if (editTimer.current)
                                    clearTimeout(editTimer.current);
                                  saveParagraph(p, editText);
                                  saveParagraph(p, "");
                                  setEditText("");
                                }}
                                onFinish={() => finishParagraph(p)}
                                onSplit={(start, end) =>
                                  changeParagraph(
                                    p,
                                    (ps, label) =>
                                      splitParagraph(
                                        ps,
                                        p.id,
                                        editText,
                                        start,
                                        end,
                                        label,
                                      ),
                                    "Author split paragraph",
                                  )
                                }
                                onJoin={(direction) =>
                                  changeParagraph(
                                    p,
                                    (ps) =>
                                      joinParagraph(
                                        ps,
                                        p.id,
                                        editText,
                                        direction,
                                      ),
                                    "Author joined paragraphs",
                                  )
                                }
                                onDelete={() => {
                                  const changed = changeParagraph(
                                    p,
                                    (ps) => ({
                                      ...deleteParagraph(ps, p.id),
                                      activeId: null,
                                    }),
                                    "Paragraph removed; preserved in history",
                                  );
                                  if (changed)
                                    setNotice(
                                      "Paragraph deleted. Earlier text remains in History.",
                                    );
                                  return changed;
                                }}
                                onFlag={() => {
                                  if (editTimer.current)
                                    clearTimeout(editTimer.current);
                                  saveParagraph(p, editText);
                                  setSelection({
                                    ids: [p.id],
                                    quote: editText,
                                  });
                                  setModal("flag");
                                }}
                              />
                            ) : (
                              <p
                                tabIndex={0}
                                title={
                                  historical
                                    ? "Double-click for passage actions"
                                    : "Double-click to edit; press Enter when focused"
                                }
                                onDoubleClick={() => manualEdit(p)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    manualEdit(p);
                                  }
                                }}
                              >
                                {p.text || (
                                  <span className="placeholder">
                                    Your next words go here…
                                  </span>
                                )}
                              </p>
                            )}
                            {!historical &&
                              editing !== p.id &&
                              !p.text.trim() &&
                              !p.section.trim() && (
                                <button
                                  className="icon empty-paragraph-remove"
                                  title="Remove empty paragraph"
                                  aria-label={`Remove empty paragraph P${p.label}`}
                                  onClick={() =>
                                    act(() => {
                                      const s = latest.current,
                                        c = s.chapters.find(
                                          (x) => x.id === chapter.id,
                                        )!,
                                        r = head(s, c);
                                      const target = r.paragraphs.find(
                                        (x) => x.id === p.id,
                                      );
                                      if (
                                        !target ||
                                        target.text.trim() ||
                                        target.section.trim()
                                      )
                                        return;
                                      update(
                                        commit(
                                          s,
                                          c.id,
                                          r.id,
                                          deleteParagraph(r.paragraphs, p.id)
                                            .paragraphs,
                                          `Removed empty P${p.label}`,
                                        ),
                                      );
                                    })
                                  }
                                >
                                  <X size={18} />
                                </button>
                              )}
                            {historical && editing === p.id && (
                              <div className="paragraph-actions">
                                <button
                                  className="icon"
                                  aria-label={`Flag P${p.label}`}
                                  onClick={() => {
                                    setSelection({
                                      ids: [p.id],
                                      quote: p.text,
                                    });
                                    setModal("flag");
                                  }}
                                >
                                  <FlagIcon size={16} />
                                </button>
                                {historical && (
                                  <button
                                    className="icon"
                                    aria-label={`Reincorporate P${p.label}`}
                                    onClick={() => {
                                      const ps = [...current!.paragraphs];
                                      const index = ps.findIndex(
                                        (x) => x.id === p.id,
                                      );
                                      if (index >= 0)
                                        ps[index] = {
                                          ...p,
                                          label: ps[index].label,
                                        };
                                      else
                                        ps.push({
                                          ...p,
                                          label: nextParagraphLabel(
                                            state,
                                            chapter,
                                          ),
                                        });
                                      update({
                                        ...state,
                                        proposals: [
                                          ...state.proposals,
                                          {
                                            id: uid(),
                                            chapterId: chapter.id,
                                            baseRevisionId: current!.id,
                                            title: `Reincorporate historical P${p.label}`,
                                            rationale: `Source revision ${historical.id}`,
                                            paragraphs: ps,
                                            status: "pending",
                                            createdAt: now(),
                                          },
                                        ],
                                      });
                                      setNotice(
                                        "Historical passage added as a proposal",
                                      );
                                    }}
                                  >
                                    <ArrowUUpLeftIcon />
                                  </button>
                                )}
                                <button
                                  className="button quiet compact"
                                  onClick={() => setEditing(null)}
                                >
                                  Done
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    {!historical && (hasProse || editing) && (
                      <button
                        className="add-paragraph"
                        onClick={() => addParagraph()}
                      >
                        <Plus size={16} />
                        Add a paragraph
                      </button>
                    )}
                    <div className="paper-end">❧</div>
                  </article>
                  <div className="document-footer">
                    <span>{saveStatus}</span>
                    <span>
                      {words.toLocaleString()} words ·{" "}
                      {book.language === "bn" ? "বাংলা" : "English"}
                    </span>
                  </div>
                </main>
                <aside className="editorial-panel">
                  <section
                    className="recent-history"
                    aria-label="Recent history"
                  >
                    <div className="panel-title">
                      <h2>Recent history</h2>
                      <ClockCounterClockwise size={20} />
                    </div>
                    <ol>
                      {recentHistory.map((g) => {
                        const r = g.rows[0];
                        return (
                          <li key={r.id}>
                            <button
                              className="recent-history-item"
                              aria-label={`Read revision: ${historyTitle(r)}`}
                              onClick={() => {
                                if (editing) {
                                  const p = current?.paragraphs.find(
                                    (p) => p.id === editing,
                                  );
                                  if (p) finishParagraph(p);
                                }
                                setHistoricalId(
                                  r.id === visibleCurrentId ? "" : r.id,
                                );
                                setSelection({ ids: [], quote: "" });
                                setEditing(null);
                              }}
                            >
                              <span>{historyTitle(r)}</span>
                              <small>
                                {new Date(r.createdAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {r.id === visibleCurrentId ? " · Current" : ""}
                              </small>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    <button
                      className="text-button"
                      onClick={() => changeView("history")}
                    >
                      All history
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  <div className="panel-title">
                    <h2>Chapter context</h2>
                    <TreeStructure size={20} />
                  </div>
                  <div className="context-card">
                    <p>{context?.summary || "No context index yet."}</p>
                    {context && (
                      <span
                        className={
                          "status-pill " +
                          (context.revisionId !== current?.id ? "stale" : "")
                        }
                      >
                        {context.revisionId === current?.id
                          ? "Up to date"
                          : "Needs reindexing"}
                      </span>
                    )}
                    <button
                      className="text-button"
                      disabled={!hasProse}
                      onClick={reindexRequest}
                    >
                      {context
                        ? "Copy reindex request"
                        : "Create context with ChatGPT"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="panel-title">
                    <h2>Open flags</h2>
                    <span className="count">
                      {flags.filter((f) => f.status === "open").length}
                    </span>
                  </div>
                  {flags
                    .filter((f) => f.status === "open")
                    .slice(0, 4)
                    .map((f) => (
                      <div className="flag-card" key={f.id}>
                        <div>
                          <span className="flag-tag">
                            F{f.number} · {f.kind}
                          </span>
                          <button
                            className="icon"
                            aria-label={`Copy F${f.number}`}
                            onClick={() =>
                              void copy(
                                `F${f.number} · flag_id ${f.id} · chapter_id ${chapter.id}`,
                              )
                            }
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                        {f.quote && (
                          <blockquote>
                            {f.quote.slice(0, 160)}
                            {f.quote.length > 160 ? "…" : ""}
                          </blockquote>
                        )}
                        <p>{f.note}</p>
                        <small>
                          {f.paragraphIds.length
                            ? "Passage flag"
                            : "Whole chapter"}{" "}
                          · {new Date(f.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                    ))}
                  {!flags.some((f) => f.status === "open") && (
                    <div className="empty-mini">
                      <FlagIcon size={24} />
                      <p>No open flags.</p>
                    </div>
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelection({ ids: [], quote: "" });
                      setModal("flag");
                    }}
                  >
                    <Plus size={17} />
                    Add flag
                  </button>
                </aside>
              </div>
            ) : view === "flags" ? (
              <main className="page">
                <div className="section-heading">
                  <div>
                    <h2>Flags</h2>
                  </div>
                  {flags.length > 0 && (
                    <button
                      className="button"
                      onClick={() => {
                        setSelection({ ids: [], quote: "" });
                        setModal("flag");
                      }}
                    >
                      <Plus />
                      New flag
                    </button>
                  )}
                </div>
                {flags.length === 0 && (
                  <Empty
                    icon={FlagIcon}
                    title="No flags yet"
                    text="Mark a passage or chapter to revisit, such as dialogue that feels unnatural. Later, ask ChatGPT to read your flags and propose changes for you to review."
                  >
                    <button
                      className="button primary"
                      onClick={() => {
                        setSelection({ ids: [], quote: "" });
                        setModal("flag");
                      }}
                    >
                      <FlagIcon />
                      Flag chapter
                    </button>
                    <button
                      className="button quiet"
                      onClick={() => changeView("manuscript")}
                    >
                      Open manuscript
                      <ArrowRight size={16} />
                    </button>
                  </Empty>
                )}
                {flags.map((f) => (
                  <section className="card" key={f.id}>
                    <div className="section-heading">
                      <span className="flag-tag">
                        F{f.number} · {f.kind} · {f.status}
                      </span>
                      <button
                        className="button quiet"
                        onClick={() =>
                          void copy(
                            `Discuss flag F${f.number} (flag_id ${f.id}). Retrieve its original passage and the latest version before proposing changes.`,
                          )
                        }
                      >
                        <Copy />
                        Copy reference
                      </button>
                    </div>
                    {f.quote && <blockquote>{f.quote}</blockquote>}
                    <p>{f.note}</p>
                    {f.audio &&
                      /^data:audio\/[a-zA-Z0-9.+-]+;base64,/.test(f.audio) && (
                        <audio
                          controls
                          src={f.audio}
                          aria-label={`Audio attachment for F${f.number}`}
                        />
                      )}
                    <p className="caption">
                      {f.paragraphIds.length} anchored paragraphs · source
                      revision {f.revisionId.slice(0, 8)}
                      {f.paragraphIds.some(
                        (id) => !current!.paragraphs.some((p) => p.id === id),
                      )
                        ? " · Passage removed or merged; original retained"
                        : ""}
                    </p>
                    <button
                      className="button"
                      onClick={() =>
                        update({
                          ...state,
                          flags: state.flags.map((x) =>
                            x.id === f.id
                              ? {
                                  ...x,
                                  status:
                                    x.status === "open" ? "resolved" : "open",
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      {f.status === "open" ? <Check /> : <ArrowsClockwise />}
                      {f.status === "open" ? "Mark resolved" : "Reopen"}
                    </button>
                  </section>
                ))}
              </main>
            ) : view === "review" ? (
              <main className="page">
                <div className="section-heading">
                  <div>
                    <h2>Proposals</h2>
                  </div>
                  {state.proposals.some((p) => p.chapterId === chapter.id) && (
                    <button
                      className="button"
                      onClick={() => setModal("proposal")}
                    >
                      <UploadSimple />
                      Import proposal
                    </button>
                  )}
                </div>
                {state.proposals.filter((p) => p.chapterId === chapter.id)
                  .length === 0 && (
                  <Empty
                    icon={GitBranch}
                    title="No proposals yet"
                    text="Download proposals saved by ChatGPT, or import one to review locally."
                  >
                    <button
                      className="button primary"
                      onClick={() => setModal("proposal")}
                    >
                      <UploadSimple />
                      Import proposal
                    </button>
                    <button
                      className="button quiet"
                      onClick={() =>
                        void copy(
                          `Chapter ${reference(chapter, current!)}; chapter_id ${chapter.id}; revision_id ${current!.id}. Retrieve the latest text through Khosra and save rewrites as proposals.`,
                        )
                      }
                    >
                      <Copy />
                      Copy chapter reference
                    </button>
                  </Empty>
                )}
                {state.proposals
                  .filter((p) => p.chapterId === chapter.id)
                  .map((p) => (
                    <section className="card" key={p.id}>
                      <div className="section-heading">
                        <h3>{p.title}</h3>
                        <span className="status-pill">{p.status}</span>
                      </div>
                      <p>{p.rationale}</p>
                      {p.baseRevisionId !== current?.id &&
                        p.status === "pending" && (
                          <p className="error">
                            The chapter changed since this proposal was created.
                            Compare it with the current manuscript; automatic
                            acceptance is blocked.
                          </p>
                        )}
                      <button
                        className="button"
                        onClick={() =>
                          setProposalId(proposalId === p.id ? "" : p.id)
                        }
                      >
                        {proposalId === p.id
                          ? "Close comparison"
                          : "Compare before & after"}
                      </button>
                      {proposalId === p.id && (
                        <ProposalReview
                          proposal={p}
                          original={state.revisions.find(
                            (r) => r.id === p.baseRevisionId,
                          )!}
                          current={current!}
                          onAccept={(ps) =>
                            act(() => {
                              update(acceptProposal(latest.current, p, ps));
                              setNotice(
                                "Revision accepted. Earlier text is preserved.",
                              );
                            })
                          }
                        />
                      )}{" "}
                      {p.status === "pending" && (
                        <button
                          className="button quiet"
                          onClick={() =>
                            update({
                              ...state,
                              proposals: state.proposals.map((x) =>
                                x.id === p.id
                                  ? { ...x, status: "rejected" }
                                  : x,
                              ),
                            })
                          }
                        >
                          Reject proposal
                        </button>
                      )}
                    </section>
                  ))}
              </main>
            ) : view === "history" ? (
              <main className="page">
                <h2>Revision history</h2>
                {state.revisions.filter((r) => r.chapterId === chapter.id)
                  .length <= 1 ? (
                  <Empty
                    icon={ClockCounterClockwise}
                    title="No earlier revisions"
                    text="Earlier versions will appear as you edit or accept proposals."
                  >
                    <button
                      className="button"
                      onClick={() => changeView("manuscript")}
                    >
                      Open manuscript
                      <ArrowRight size={16} />
                    </button>
                  </Empty>
                ) : (
                  <>
                    {" "}
                    <History
                      revisions={state.revisions.filter(
                        (r) => r.chapterId === chapter.id,
                      )}
                      currentId={chapter.headId}
                      onRestoreParagraph={(sourceId, paragraphId) =>
                        act(() => {
                          const s = latest.current,
                            c = s.chapters.find((x) => x.id === chapter.id)!,
                            r = head(s, c);
                          const source = s.revisions.find(
                            (x) => x.id === sourceId && x.chapterId === c.id,
                          );
                          if (!source)
                            throw Error("Source revision unavailable.");
                          const ps = restoreParagraph(
                            r.paragraphs,
                            source.paragraphs,
                            paragraphId,
                            nextParagraphLabel(s, c),
                            editionReferences(s.revisions, r),
                          );
                          update(
                            commit(
                              s,
                              c.id,
                              r.id,
                              ps,
                              `Restored P${ps.find((p) => p.id === paragraphId)!.label} from history`,
                            ),
                          );
                          setNotice("Paragraph restored to the manuscript.");
                        })
                      }
                      onRead={(id) => {
                        setHistoricalId(id);
                        setView("manuscript");
                      }}
                      onRestore={(id) => {
                        setHistoricalId(id);
                        setModal("restoreRevision");
                      }}
                    />
                  </>
                )}
              </main>
            ) : (
              <main className="page">
                <div className="section-heading">
                  <div>
                    <h2>Chapter context</h2>
                  </div>
                  {hasProse && (
                    <button
                      className="button primary"
                      disabled={!hasProse}
                      onClick={reindexRequest}
                    >
                      <ArrowsClockwise />
                      Copy reindex request
                    </button>
                  )}
                </div>
                {context ? (
                  <>
                    <section className="card">
                      <div className="section-heading">
                        <h3>Chapter summary</h3>
                        <span
                          className={
                            "status-pill " +
                            (context.revisionId !== current?.id ? "stale" : "")
                          }
                        >
                          {context.revisionId === current?.id
                            ? "Current"
                            : "Stale — manuscript changed"}
                        </span>
                      </div>
                      <p className="preserve">{context.summary}</p>
                      <p className="caption">
                        Source revision {context.revisionId} · Generated{" "}
                        {new Date(context.createdAt).toLocaleString()}
                      </p>
                    </section>
                    {context.facts.map((f, i) => (
                      <section className="card" key={i}>
                        <span className="flag-tag">{f.kind}</span>
                        <p>{f.text}</p>
                        <small>
                          {f.paragraphIds
                            .map((id) => {
                              const r = state.revisions.find(
                                (r) => r.id === context.revisionId,
                              );
                              const p = r?.paragraphs.find((p) => p.id === id);
                              return p ? reference(chapter, r!, p) : id;
                            })
                            .join(", ")}
                        </small>
                      </section>
                    ))}
                  </>
                ) : (
                  <Empty
                    icon={TreeStructure}
                    title="No context index yet"
                    text={
                      hasProse
                        ? "Ask ChatGPT to index this chapter, then download the saved context."
                        : "Add chapter text before creating a context index."
                    }
                  >
                    <button
                      className="button"
                      onClick={() => changeView("manuscript")}
                    >
                      Open manuscript
                      <ArrowRight size={16} />
                    </button>
                  </Empty>
                )}
                {book.premise.trim() && (
                  <section className="card">
                    <h3>Author’s premise</h3>
                    <p className="preserve">
                      {book.premise || "No premise recorded."}
                    </p>
                    <p className="caption">
                      Summaries aid navigation. The source manuscript remains
                      authoritative.
                    </p>
                  </section>
                )}
              </main>
            )}
          </>
        )}
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void restoreFile(e.target.files?.[0])}
      />
      {selection.quote && view === "manuscript" && !reading && !modal && (
        <div className="selection-toolbar">
          <span>{selection.quote.slice(0, 45)}…</span>
          <button className="button primary" onClick={() => setModal("flag")}>
            <FlagIcon />
            Flag selection
          </button>
          <button
            className="icon"
            aria-label="Clear selection"
            onClick={() => setSelection({ ids: [], quote: "" })}
          >
            <X />
          </button>
        </div>
      )}
      {shareOpen && book && (
        <Share
          onConnected={() => setServerReady(true)}
          book={book}
          chapters={chapters}
          onClose={() => setShareOpen(false)}
          onSettings={() => {
            setShareOpen(false);
            changeView("settings");
          }}
        />
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (modal !== "actions" && modal !== "paste") setModal("");
          }}
        >
          <section
            className={`modal${modal === "actions" ? " chapter-actions-modal" : modal === "paste" ? " paste-chapter-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal("");
              if (e.key === "Tab") {
                const items = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),[tabindex="0"],summary',
                  ),
                ).filter((item) => item.getClientRects().length > 0);
                const first = items[0],
                  last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="icon modal-close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={22} />
            </button>
            <h2 id="modal-title">
              {
                {
                  book: "New manuscript",
                  chapter: "New chapter",
                  flag: "New flag",
                  rename: "Chapter details",
                  actions: "Chapter actions",
                  deleteChapter: "Delete chapter?",
                  chapterTrash: "Deleted chapters",
                  jump: "Find your place",
                  paste: "Paste a chapter",
                  proposal: "Import a proposal",
                  pull: "Download server workspace",
                  syncConflict: "Bring both versions together",
                  restoreRevision: "Restore an earlier chapter",
                }[modal]
              }
            </h2>
            {modal === "deleteChapter" && chapter && (
              <div className="chapter-delete-confirm">
                <p>
                  Move <strong lang={book?.language}>{chapter.title}</strong> to
                  Trash?
                </p>
                <p className="muted">
                  Its text, revision history, flags and proposals are kept.
                  Restore it from Contents → Deleted chapters.
                </p>
                <p className="muted">
                  Existing reading links keep their shared snapshots. Revoke
                  them in Share if needed.
                </p>
                <div className="button-row">
                  <button
                    autoFocus
                    className="button"
                    onClick={() => setModal("actions")}
                  >
                    Cancel
                  </button>
                  <button
                    className="button danger"
                    onClick={() =>
                      act(() => {
                        if (editTimer.current) clearTimeout(editTimer.current);
                        const s = trashChapter(latest.current, chapter.id);
                        const index = chapters.findIndex(
                          (c) => c.id === chapter.id,
                        );
                        const remaining = manuscriptChapters(s, chapter.bookId);
                        update(s);
                        setChapterId(
                          (remaining[index] || remaining[index - 1])?.id || "",
                        );
                        setHistoricalId("");
                        setEditing(null);
                        setSelection({ ids: [], quote: "" });
                        setModal("");
                        setView("manuscript");
                        setNotice(
                          "Chapter moved to Trash. Restore it from Contents → Deleted chapters.",
                        );
                      })
                    }
                  >
                    <Trash size={18} />
                    Delete chapter
                  </button>
                </div>
              </div>
            )}
            {modal === "chapterTrash" && book && (
              <ChapterTrash
                state={state}
                chapters={deletedChapters}
                language={book.language}
                onRestore={(id) =>
                  act(() => {
                    const s = restoreChapter(latest.current, id);
                    update(s);
                    choose(s.chapters.find((c) => c.id === id)!);
                    setModal("");
                    setView("manuscript");
                    setNotice(
                      "Chapter restored with its history and references.",
                    );
                  })
                }
              />
            )}
            {modal === "book" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => newBook(new FormData(e.currentTarget)));
                }}
              >
                <label>
                  Working title
                  <input
                    name="title"
                    required
                    maxLength={300}
                    placeholder="A name for your story"
                  />
                </label>
                <label>
                  Rough premise
                  <textarea
                    name="premise"
                    rows={4}
                    placeholder="A few words, a question, a possibility…"
                  />
                </label>
                <label>
                  Manuscript language
                  <select name="language">
                    <option value="bn">বাংলা · Bengali</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <button className="button primary" type="submit">
                  Create manuscript
                  <ArrowRight />
                </button>
              </form>
            )}
            {modal === "chapter" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const s = addChapter(
                    state,
                    book!.id,
                    String(new FormData(e.currentTarget).get("title")),
                  );
                  update(s);
                  setChapterId(s.chapters.at(-1)!.id);
                  setModal("");
                  setView("manuscript");
                }}
              >
                <label>
                  Chapter title
                  <input name="title" required maxLength={300} />
                </label>
                <button className="button primary" type="submit">
                  Add chapter
                  <Plus />
                </button>
              </form>
            )}
            {modal === "flag" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => submitFlag(new FormData(e.currentTarget)));
                }}
              >
                {selection.quote ? (
                  <blockquote>{selection.quote.slice(0, 800)}</blockquote>
                ) : (
                  <p className="muted">
                    This thought applies to the whole chapter.
                  </p>
                )}
                <label>
                  What would you like to revisit?
                  <textarea
                    name="note"
                    required
                    rows={4}
                    placeholder="Make the dialogue more natural…"
                  />
                </label>
                <label>
                  Intent
                  <select name="kind">
                    <option value="rewrite">Request a rewrite</option>
                    <option value="discussion">
                      Discuss / explore an idea
                    </option>
                    <option value="reference">Keep as a reference note</option>
                  </select>
                </label>
                <button className="button primary" type="submit">
                  Save flag
                  <FlagIcon />
                </button>
              </form>
            )}
            {modal === "rename" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  update({
                    ...state,
                    chapters: state.chapters.map((c) =>
                      c.id === chapter!.id
                        ? {
                            ...c,
                            title: String(f.get("title")),
                            synopsis: String(f.get("synopsis")),
                          }
                        : c,
                    ),
                  });
                  setModal("");
                }}
              >
                <label>
                  Title
                  <input name="title" required defaultValue={chapter?.title} />
                </label>
                <label>
                  Outline / synopsis
                  <textarea
                    rows={5}
                    name="synopsis"
                    defaultValue={chapter?.synopsis}
                  />
                </label>
                <button className="button primary">Save details</button>
              </form>
            )}
            {modal === "actions" && (
              <>
                <div className="chapter-action-list">
                  <button
                    className="chapter-action"
                    aria-label="Paste or replace chapter text"
                    onClick={() => setModal("paste")}
                  >
                    <PencilSimple />
                    <span>
                      Paste or replace chapter text
                      <small>Import a draft as a new revision.</small>
                    </span>
                    <ArrowRight className="action-chevron" />
                  </button>
                  <button
                    className="chapter-action"
                    onClick={() => {
                      setModal("");
                      setShareOpen(true);
                    }}
                  >
                    <ShareIcon />
                    <span>
                      Share for reading
                      <small>
                        Private invitations, expiry and reader feedback.
                      </small>
                    </span>
                    <ArrowRight className="action-chevron" />
                  </button>
                  <button
                    className="chapter-action"
                    aria-label="Renumber paragraph references"
                    onClick={() =>
                      act(() => {
                        update(renumber(state, chapter!));
                        setModal("");
                        setNotice(
                          "References renumbered in a new edition. Earlier references preserved.",
                        );
                      })
                    }
                  >
                    <ArrowsClockwise />
                    <span>
                      Renumber paragraph references
                      <small>
                        Create a new reference edition; keep earlier addresses
                        in history.
                      </small>
                    </span>
                    <ArrowRight className="action-chevron" />
                  </button>
                  <button
                    className="chapter-action"
                    aria-label="Mark this revision approved"
                    onClick={() => {
                      update({
                        ...state,
                        chapters: state.chapters.map((c) =>
                          c.id === chapter!.id
                            ? { ...c, approvedId: c.headId }
                            : c,
                        ),
                      });
                      setModal("");
                    }}
                  >
                    <BookmarkSimple />
                    <span>
                      Mark this revision approved
                      <small>Keep this version as your approved draft.</small>
                    </span>
                    <ArrowRight className="action-chevron" />
                  </button>
                </div>
                <div className="chapter-order">
                  <h3>Chapter order</h3>
                  <div className="chapter-order-buttons">
                    {[-1, 1].map((dir) => (
                      <button
                        key={dir}
                        aria-label={`Move chapter ${dir < 0 ? "earlier" : "later"}`}
                        className="button"
                        disabled={
                          chapters.indexOf(chapter!) + dir < 0 ||
                          chapters.indexOf(chapter!) + dir >= chapters.length
                        }
                        onClick={() => {
                          const i = chapters.indexOf(chapter!),
                            other = chapters[i + dir];
                          update({
                            ...state,
                            chapters: state.chapters.map((c) =>
                              c.id === chapter!.id
                                ? { ...c, position: other.position }
                                : c.id === other.id
                                  ? { ...c, position: chapter!.position }
                                  : c,
                            ),
                          });
                          setModal("");
                        }}
                      >
                        {dir < 0 ? <ArrowUp /> : <ArrowDown />}
                        <span>Move {dir < 0 ? "earlier" : "later"}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <details className="chapter-sections">
                  <summary>
                    Subsection headings{" "}
                    <span>
                      {current?.paragraphs.filter((p) => p.section).length || 0}
                    </span>
                  </summary>
                  <p>
                    Add a heading before a paragraph. Changes save when you
                    leave the field.
                  </p>
                  <div className="chapter-section-list">
                    {current?.paragraphs.map((p) => (
                      <div className="section-row" key={p.id}>
                        <span>P{p.label}</span>
                        <div className="chapter-section-field">
                          <input
                            aria-label={`Subsection heading P${p.label}`}
                            placeholder="Optional subsection heading"
                            defaultValue={p.section}
                            onBlur={(e) => {
                              if (e.target.value !== p.section)
                                act(() => {
                                  const c = latest.current.chapters.find(
                                    (c) => c.id === chapter!.id,
                                  )!;
                                  const r = head(latest.current, c);
                                  update(
                                    commit(
                                      latest.current,
                                      c.id,
                                      r.id,
                                      r.paragraphs.map((x) =>
                                        x.id === p.id
                                          ? { ...x, section: e.target.value }
                                          : x,
                                      ),
                                      "Subsection updated",
                                    ),
                                  );
                                });
                            }}
                          />
                          <small className="chapter-paragraph-preview">
                            {p.text || "Empty paragraph"}
                          </small>
                        </div>
                        <button
                          className="icon"
                          title={`Delete paragraph P${p.label}`}
                          aria-label={`Delete paragraph P${p.label}`}
                          onClick={() => {
                            act(() => {
                              const c = latest.current.chapters.find(
                                (c) => c.id === chapter!.id,
                              )!;
                              const r = head(latest.current, c);
                              update(
                                commit(
                                  latest.current,
                                  c.id,
                                  r.id,
                                  r.paragraphs.filter((x) => x.id !== p.id),
                                  "Paragraph removed; preserved in history",
                                ),
                              );
                            });
                            setModal("");
                          }}
                        >
                          <Trash />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
                <div className="chapter-delete-action">
                  <div>
                    <h3>Remove chapter</h3>
                    <p>Move to Trash with its text and history.</p>
                  </div>
                  <button
                    className="button chapter-delete-button"
                    aria-label="Delete chapter"
                    onClick={() => setModal("deleteChapter")}
                  >
                    <Trash size={18} />
                    Delete
                  </button>
                </div>
              </>
            )}
            {modal === "paste" && (
              <PasteChapter
                paragraphs={current?.paragraphs.map((p) => p.text) || []}
                onSave={(texts) =>
                  act(() => {
                    const paragraphs = chapterReplacement(
                      state,
                      chapter!,
                      texts,
                    );
                    update(
                      commit(
                        state,
                        chapter!.id,
                        current!.id,
                        paragraphs,
                        "Author replaced chapter text",
                      ),
                    );
                    setModal("");
                  })
                }
              />
            )}
            {modal === "jump" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const query = String(
                    new FormData(e.currentTarget).get("ref"),
                  );
                  const m = /^(?:R(\d+):)?C(\d+)(?:-P(\d+))?$/i.exec(
                    query.trim(),
                  );
                  if (!m) {
                    setError("Use a reference such as R1:C3-P17 or C3-P17.");
                    return;
                  }
                  const c = chapters.find((c) => c.code === Number(m[2]));
                  if (!c) {
                    setError("Chapter not found in this book.");
                    return;
                  }
                  const r = m[1]
                    ? state.revisions
                        .filter(
                          (r) =>
                            r.chapterId === c.id &&
                            r.edition === Number(m[1]) &&
                            (!m[3] ||
                              r.paragraphs.some(
                                (p) => p.label === Number(m[3]),
                              )),
                        )
                        .at(-1)
                    : head(state, c);
                  if (!r) {
                    setError("Reference edition not found.");
                    return;
                  }
                  const p = m[3]
                    ? r.paragraphs.find((p) => p.label === Number(m[3]))
                    : undefined;
                  if (m[3] && !p) {
                    setError("Paragraph not found in this edition.");
                    return;
                  }
                  choose(c);
                  setHistoricalId(r.id === c.headId ? "" : r.id);
                  setView("manuscript");
                  setModal("");
                  if (p)
                    setTimeout(
                      () =>
                        document.getElementById("p-" + p.id)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        }),
                      100,
                    );
                }}
              >
                <label>
                  Chapter or paragraph reference
                  <input name="ref" placeholder="R1:C3-P17" required />
                </label>
                <button className="button primary">
                  Go to passage
                  <ArrowRight />
                </button>
              </form>
            )}
            {modal === "proposal" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => {
                    const raw = JSON.parse(
                      String(new FormData(e.currentTarget).get("json")),
                    );
                    const next = validateState({
                      ...state,
                      proposals: [
                        ...state.proposals,
                        {
                          ...raw,
                          id: uid(),
                          status: "pending",
                          createdAt: now(),
                        },
                      ],
                    });
                    update(next);
                    setModal("");
                  });
                }}
              >
                <p className="muted">
                  Paste a proposal with chapterId, baseRevisionId, title,
                  rationale, and a complete paragraphs array. IDs must match
                  your archive.
                </p>
                <label>
                  Proposal JSON
                  <textarea name="json" required rows={9} />
                </label>
                <button className="button primary">Validate & import</button>
              </form>
            )}
            {modal === "syncConflict" && incoming && (
              <SyncReview
                local={state}
                remote={incoming.state}
                onMerge={(merged) => {
                  void (async () => {
                    await backup();
                    await db.meta.put({
                      id: "serverVersion",
                      value: incoming.version,
                    });
                    update(merged);
                    setIncoming(null);
                    setModal("");
                    setNotice(
                      "Both histories retained. Upload the reconciled workspace when ready.",
                    );
                  })().catch((e) => setError(String(e)));
                }}
              />
            )}
            {modal === "pull" && (
              <>
                <p>
                  This replaces the local workspace with the server version,
                  including ChatGPT’s saved proposals. A local safety archive is
                  downloaded first. Upload any local changes before downloading.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    void (async () => {
                      await backup();
                      const data = await server.pull();
                      await db.meta.put({
                        id: "serverVersion",
                        value: data.version,
                      });
                      update(data.state);
                      setBookId(data.state.books[0]?.id || "");
                      setChapterId(data.state.chapters[0]?.id || "");
                      setModal("");
                      setNotice("Server workspace downloaded");
                    })().catch((e) => setError(String(e)));
                  }}
                >
                  Back up & download
                </button>
              </>
            )}
            {modal === "restoreRevision" && (
              <>
                <p>
                  Restore this chapter from{" "}
                  {historical &&
                    new Date(historical.createdAt).toLocaleString()}
                  ? Today’s text remains in history.
                </p>
                <button
                  className="button primary"
                  onClick={() =>
                    act(() => {
                      update(
                        commit(
                          state,
                          chapter!.id,
                          current!.id,
                          reincorporate(
                            state,
                            chapter!,
                            historical!.paragraphs,
                          ),
                          `Restored from ${historical!.id}`,
                          "restore",
                        ),
                      );
                      setHistoricalId("");
                      setModal("");
                      setView("manuscript");
                    })
                  }
                >
                  Restore as a new revision
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function ArrowUUpLeftIcon() {
  return <ClockCounterClockwise size={16} />;
}
initializeAppearance();
const guestPage = location.pathname.replace(/\/$/, "") === "/guest";
createRoot(document.getElementById("root")!).render(
  guestPage ? <Guest /> : <App />,
);
if (
  !guestPage &&
  "serviceWorker" in navigator &&
  !location.hostname.match(/^(localhost|127\.0\.0\.1)$/)
)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Offline readiness is not claimed when registration fails. */
    });
  });
