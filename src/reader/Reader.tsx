import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowsOut } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import { ArrowsIn } from "@phosphor-icons/react/dist/csr/ArrowsIn";
import { lockScroll } from "../scrollLock";
import ReaderSettings from "./ReaderSettings";
import ReadingProgress from "./ReadingProgress";
import { useMousePageTurn } from "./useMousePageTurn";
import {
  readGuestPreferences,
  readPreferences,
  type Preferences,
} from "./preferences";
import type { Paragraph } from "../domain/model";
import "./reader.css";
import { pageGeometry, marginFactors, pageFormats } from "./pageGeometry";
import PageTurn, { type Turn } from "./PageTurn";

export default function Reader({
  contentId,
  title,
  number,
  language,
  paragraphs,
  historical,
  guest = false,
  loading = false,
  previous,
  next,
}: {
  contentId: string;
  title: string;
  number: number;
  language: string;
  paragraphs: Paragraph[];
  historical: boolean;
  guest?: boolean;
  loading?: boolean;
  previous?: () => void;
  next?: () => void;
}) {
  const [prefs, setPrefs] = useState(() => {
    const p = guest
      ? readGuestPreferences(window.innerWidth)
      : readPreferences();
    return guest ? { ...p, showIds: false } : p;
  });
  const [width, setWidth] = useState(0);
  const [fullscreenHeight, setFullscreenHeight] = useState(
    window.innerHeight - 132,
  );
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnId = useRef(0);
  const root = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const chapterNavigation = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [screenNotice, setScreenNotice] = useState("");
  const immersive = nativeFullscreen || focusMode;
  const turning = useRef(false);
  const contentGeneration = useRef(0);
  const queued = useRef<number | null>(null);
  const navigate = useRef<(page: number) => void>(() => {});

  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const paged = prefs.mode !== "continuous";
  const spread = prefs.mode === "spread" && width >= 760 ? 2 : 1;
  const geometry = pageGeometry(
    width,
    spread,
    prefs.format,
    prefs.margins,
    immersive
      ? prefs.fullscreenZoom === "page"
        ? fullscreenHeight / (pageFormats[prefs.format].height * 96)
        : prefs.fullscreenZoom === "width"
          ? Infinity
          : (fullscreenHeight / (pageFormats[prefs.format].height * 96)) *
            (Number(prefs.fullscreenZoom) / 100)
      : 1.15,
  );
  const { gap, column, textHeight: height } = geometry;
  useLayoutEffect(() => {
    if (!immersive || !root.current || !stage.current) return;
    const container = root.current;
    const measure = () => {
      const top =
        stage.current!.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      const frame = stage.current!.querySelector(".reading-paper-frame")!;
      const bottom =
        chapterNavigation.current?.getBoundingClientRect().bottom ??
        stage.current!.getBoundingClientRect().bottom;
      const footer = Math.max(0, bottom - frame.getBoundingClientRect().bottom);
      const padding =
        parseFloat(getComputedStyle(container).paddingBottom) || 0;
      setFullscreenHeight(
        Math.max(
          100,
          Math.floor(container.clientHeight - top - footer - padding - 1),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(stage.current);
    if (toolbar.current) observer.observe(toolbar.current);
    if (chapterNavigation.current) observer.observe(chapterNavigation.current);
    measure();
    return () => observer.disconnect();
  }, [immersive, paged, spread, screenNotice, loading]);
  useLayoutEffect(() => {
    if (immersive && paged && root.current) root.current.scrollTop = 0;
  }, [immersive, paged, prefs.fullscreenZoom]);

  useEffect(() => {
    const changed = () => {
      setNativeFullscreen(document.fullscreenElement === root.current);
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const unlock = lockScroll(document.body);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusMode && !e.defaultPrevented) {
        setFocusMode(false);
        setScreenNotice("");
        fullscreenButton.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      unlock();
      document.removeEventListener("keydown", escape);
    };
  }, [immersive, focusMode]);
  useEffect(() => {
    if (prefs.selectable) return;
    const selection = window.getSelection();
    if (selection?.anchorNode && text.current?.contains(selection.anchorNode))
      selection.removeAllRanges();
  }, [prefs.selectable]);
  async function toggleFullscreen() {
    setScreenNotice("");
    if (document.fullscreenElement === root.current) {
      await document.exitFullscreen();
      return;
    }
    if (focusMode) {
      setFocusMode(false);
      return;
    }
    try {
      if (!root.current?.requestFullscreen) throw new Error("Unavailable");
      await root.current.requestFullscreen();
    } catch {
      setFocusMode(true);
      setScreenNotice(
        "Using a window-filling view; browser fullscreen is unavailable.",
      );
    }
  }
  useLayoutEffect(() => {
    contentGeneration.current++;
    turning.current = false;
    queued.current = null;
    touch.current = null;
    setTurn(null);
    setPage(0);
    root.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [contentId]);
  useEffect(() => {
    try {
      localStorage.setItem(
        guest ? "khosra-guest-reader" : "khosra-reader",
        JSON.stringify(prefs),
      );
    } catch {
      /* Reading works without storage. */
    }
  }, [prefs, guest]);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [paged]);
  useLayoutEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !text.current || !paged) return;
      const count = Math.max(
        1,
        Math.round((text.current.scrollWidth + gap) / (column + gap)),
      );
      turning.current = false;
      queued.current = null;
      setTurn(null);
      setPages(count);
      setPage((p) =>
        Math.min(
          Math.floor(p / spread) * spread,
          Math.floor((count - 1) / spread) * spread,
        ),
      );
    };
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
    };
  }, [height, spread, prefs, paragraphs, title, paged, column, gap]);
  const goTo = (target: number) => {
    const to = Math.max(
      0,
      Math.min(Math.floor((pages - 1) / spread) * spread, target),
    );
    if (to === page) return;
    if (turning.current) {
      queued.current = to;
      return;
    }
    if (
      Math.abs(to - page) === spread &&
      prefs.flip &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      text.current
    ) {
      turning.current = true;
      setTurn({
        id: ++turnId.current,
        from: page,
        to,
        direction: to > page ? 1 : -1,
        snapshot: text.current.cloneNode(true) as HTMLElement,
      });
    } else setTurn(null);
    setPage(to);
  };
  const move = (direction: number) => goTo(page + direction * spread);
  useEffect(() => {
    navigate.current = goTo;
  });
  function finishTurn() {
    turning.current = false;
    setTurn(null);
    const target = queued.current;
    queued.current = null;
    const generation = contentGeneration.current;
    if (target !== null)
      requestAnimationFrame(() => {
        if (generation === contentGeneration.current) navigate.current(target);
      });
  }

  useEffect(() => {
    if (!paged) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            "input,select,textarea,button,summary,[contenteditable]",
          ))
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        move(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [paged, pages, spread, page, prefs.flip]);
  const mouseTurn = useMousePageTurn(paged && prefs.drag, (direction) =>
    move(direction),
  );
  const content = (
    <>
      <header className="reading-title">
        <span lang={language}>
          {language === "bn"
            ? `অধ্যায় ${new Intl.NumberFormat("bn", { useGrouping: false }).format(number)}`
            : `CHAPTER ${String(number).padStart(2, "0")}`}
        </span>
        <h1>{title}</h1>
        <i />
      </header>
      {!paragraphs.some((p) => p.text.trim() || p.section?.trim()) && (
        <p>This chapter has no text yet.</p>
      )}
      {paragraphs.map((p) => (
        <Fragment key={p.id}>
          {p.section && <h2>{p.section}</h2>}
          {p.text && (
            <p data-paragraph={p.id} data-reference={`P${p.label}`}>
              {p.text}
            </p>
          )}
        </Fragment>
      ))}
    </>
  );
  return (
    <main
      ref={root}
      aria-busy={loading || undefined}
      className={`reader-page book-reader ${paged ? "is-paged" : "is-continuous"} ${prefs.mode === "spread" ? "wants-spread" : ""} ${prefs.flip ? "with-flip" : ""} paper-${prefs.paper} texture-${prefs.texture} ${prefs.selectable ? "" : "text-unselectable"} ${prefs.showIds ? "show-paragraph-ids" : ""} ${immersive ? "is-immersive" : ""}`}
    >
      <div
        ref={toolbar}
        className="reading-toolbar"
        style={
          paged
            ? {
                width: Math.max(geometry.displayWidth, Math.min(width, 360)),
                maxWidth: "100%",
                marginInline: "auto",
              }
            : undefined
        }
      >
        <label className="reading-mode">
          <span className="sr-only">Reading layout</span>
          <select
            aria-label="Reading layout"
            value={prefs.mode}
            onChange={(e) => {
              setPrefs({
                ...prefs,
                mode: e.target.value as Preferences["mode"],
              });
              setPage(0);
            }}
          >
            <option value="continuous">Continuous</option>
            <option value="pages">Single page</option>
            <option value="spread">Two pages</option>
          </select>
        </label>
        {historical && (
          <span className="reading-version">Historical revision</span>
        )}
        <ReaderSettings guest={guest} prefs={prefs} onChange={setPrefs} />
        <button
          ref={fullscreenButton}
          className="icon fullscreen-toggle"
          aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
          title={immersive ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={() => void toggleFullscreen()}
        >
          {immersive ? <ArrowsIn size={21} /> : <ArrowsOut size={21} />}
        </button>
        {prefs.progress && (
          <ReadingProgress
            key={contentId}
            paged={paged}
            page={page}
            pages={pages}
            spread={spread}
            hasText={paragraphs.some((p) => p.text.trim() || p.section?.trim())}
            root={root}
            text={text}
          />
        )}
      </div>
      {loading && (
        <p className="reader-screen-notice" role="status">
          Loading chapter…
        </p>
      )}
      {screenNotice && (
        <p className="reader-screen-notice" role="status">
          {screenNotice}
        </p>
      )}
      {prefs.mode === "spread" && spread === 1 && (
        <p className="spread-hint">
          Two pages appear when the window is wider.
        </p>
      )}
      <div
        ref={stage}
        className="reading-stage"
        style={
          { "--sheet-width": `${geometry.displayWidth}px` } as CSSProperties
        }
      >
        <div
          className="reading-paper-frame"
          style={
            paged
              ? { width: geometry.displayWidth, height: geometry.displayHeight }
              : undefined
          }
        >
          <div
            ref={sheet}
            className={`reading-sheet ${spread === 2 ? "is-spread" : ""}`}
            style={{
              fontSize: `${prefs.size}pt`,
              lineHeight: prefs.leading,
              ...(paged
                ? {
                    width: geometry.width,
                    height: geometry.height,
                    padding: `${geometry.insetY}px ${geometry.insetX}px`,
                    transform: `scale(${geometry.scale})`,
                    transformOrigin: "top left",
                  }
                : {
                    padding: `40px ${Math.max(16, width * marginFactors[prefs.margins])}px 32px`,
                  }),
            }}
          >
            <div
              ref={viewport}
              tabIndex={0}
              role="region"
              aria-label="Manuscript pages"
              onPointerDown={mouseTurn.onPointerDown}
              onPointerUp={mouseTurn.onPointerUp}
              onPointerCancel={mouseTurn.onPointerCancel}
              onLostPointerCapture={mouseTurn.onLostPointerCapture}
              className={`reading-viewport ${paged && prefs.drag ? "mouse-page-drag" : ""} ${mouseTurn.dragging ? "is-dragging" : ""}`}
              style={paged ? { height } : undefined}
              onTouchStart={(e) => {
                touch.current = {
                  x: e.changedTouches[0].clientX,
                  y: e.changedTouches[0].clientY,
                };
              }}
              onTouchEnd={(e) => {
                const start = touch.current;
                touch.current = null;
                if (!paged || !start) return;
                const dx = e.changedTouches[0].clientX - start.x,
                  dy = e.changedTouches[0].clientY - start.y;
                if (
                  Math.abs(dx) > 65 &&
                  Math.abs(dx) > Math.abs(dy) * 1.8 &&
                  !window.getSelection()?.toString()
                )
                  move(dx < 0 ? 1 : -1);
              }}
            >
              <article
                ref={text}
                lang={language}
                className="reading-text"
                style={
                  paged
                    ? {
                        width: column,
                        height,
                        columnWidth: column,
                        columnGap: gap,
                        transform: `translateX(${-page * (column + gap)}px)`,
                      }
                    : undefined
                }
              >
                {content}
              </article>
            </div>
            {paged && turn && (
              <PageTurn
                key={turn.id}
                turn={turn}
                current={text}
                sheet={sheet}
                viewport={viewport}
                column={column}
                gap={gap}
                spread={spread}
                scale={geometry.scale}
                done={finishTurn}
              />
            )}
            {paged && (
              <div className="reading-folios" aria-hidden="true">
                <span>{page + 1}</span>
                {spread === 2 && (
                  <span>{page + 2 <= pages ? page + 2 : ""}</span>
                )}
              </div>
            )}
          </div>
        </div>
        {paged && (
          <nav className="page-navigation" aria-label="Reading pages">
            <button
              className="icon"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => move(-1)}
            >
              <ArrowLeft size={21} />
            </button>
            <label>
              <span className="sr-only">Go to page</span>
              <select
                aria-label="Go to page"
                value={page}
                onChange={(e) => {
                  goTo(Number(e.target.value));
                }}
              >
                {Array.from({ length: Math.ceil(pages / spread) }, (_, i) => (
                  <option key={i} value={i * spread}>
                    {spread === 2
                      ? `${i * spread + 1}–${Math.min(pages, i * spread + 2)}`
                      : i + 1}
                  </option>
                ))}
              </select>
              <span aria-live="polite" aria-atomic="true">
                {" "}
                of {pages} pages
              </span>
            </label>
            <button
              className="icon"
              aria-label="Next page"
              disabled={page + spread >= pages}
              onClick={() => move(1)}
            >
              <ArrowRight size={21} />
            </button>
          </nav>
        )}
      </div>
      <div ref={chapterNavigation} className="reader-navigation">
        <button
          className="button quiet"
          disabled={!previous}
          onClick={previous}
        >
          <ArrowLeft />
          Previous chapter
        </button>
        <button className="button quiet" disabled={!next} onClick={next}>
          Next chapter
          <ArrowRight />
        </button>
      </div>
    </main>
  );
}
