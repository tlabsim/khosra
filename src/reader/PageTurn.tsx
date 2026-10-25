import { useLayoutEffect, useRef, type RefObject } from "react";
export type Turn = {
  id: number;
  from: number;
  to: number;
  direction: number;
  snapshot: HTMLElement;
};
/** Full paper faces, including their original text insets and folios. All copies are inert. */
export default function PageTurn({
  turn,
  current,
  sheet,
  viewport,
  column,
  gap,
  spread,
  scale,
  done,
}: {
  turn: Turn;
  current: RefObject<HTMLElement | null>;
  sheet: RefObject<HTMLDivElement | null>;
  viewport: RefObject<HTMLDivElement | null>;
  column: number;
  gap: number;
  spread: number;
  scale: number;
  done: () => void;
}) {
  const scene = useRef<HTMLDivElement>(null),
    leaf = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null),
    back = useRef<HTMLDivElement>(null),
    stationary = useRef<HTMLDivElement>(null);
  const forward = turn.direction > 0;
  useLayoutEffect(() => {
    const paper = sheet.current,
      frame = viewport.current,
      el = leaf.current;
    if (!paper || !frame || !el || !scene.current) return;
    const paperBox = paper.getBoundingClientRect(),
      frameBox = frame.getBoundingClientRect();
    // Client dimensions exclude the paper border; the overlay sits inside that border.
    const faceWidth = paper.clientWidth / spread,
      faceHeight = paper.clientHeight;
    const insetX = (frameBox.left - paperBox.left) / scale - paper.clientLeft;
    const insetY = (frameBox.top - paperBox.top) / scale - paper.clientTop;
    const copy = (
      source: HTMLElement,
      target: HTMLElement | null,
      page: number,
      side: number,
    ) => {
      if (!target) return;
      const clone = source.cloneNode(true) as HTMLElement;
      clone.className = "turn-text";
      clone.style.position = "absolute";
      clone.style.left = `${insetX + side * (column + gap) - side * faceWidth}px`;
      clone.style.top = `${insetY}px`;
      clone.style.transform = `translateX(${-page * (column + gap)}px)`;
      const crop = document.createElement("div");
      crop.className = "turn-text-window";
      crop.style.cssText = `position:absolute;left:${insetX + side * (column + gap) - side * faceWidth}px;top:${insetY}px;width:${column}px;height:${frame.clientHeight}px;overflow:hidden`;
      clone.style.left = "0px";
      clone.style.top = "0px";
      crop.append(clone);
      const folio = document.createElement("span");
      folio.className = "turn-folio";
      folio.textContent = String(page + 1);
      target.replaceChildren(crop, folio);
    };
    const turningSide = forward ? spread - 1 : 0;
    el.style.width = `${faceWidth}px`;
    el.style.height = `${faceHeight}px`;
    el.style.left = `${64 + turningSide * faceWidth}px`;
    el.style.top = "64px";
    scene.current.style.setProperty("--leaf-width", `${faceWidth}px`);
    copy(turn.snapshot, front.current, turn.from + turningSide, turningSide);
    if (current.current)
      copy(
        current.current,
        back.current,
        turn.to + (forward ? 0 : spread - 1),
        forward ? 0 : spread - 1,
      );
    if (stationary.current) {
      const side = forward ? 0 : 1;
      stationary.current.style.cssText = `left:${64 + side * faceWidth}px;top:64px;width:${faceWidth}px;height:${faceHeight}px`;
      copy(turn.snapshot, stationary.current, turn.from + side, side);
    }
    const cancel = (event: AnimationEvent) => {
      if (event.target === el) done();
    };
    el.addEventListener("animationcancel", cancel);
    return () => el.removeEventListener("animationcancel", cancel);
  }, [turn, column, gap, spread, scale]);
  return (
    <div
      ref={scene}
      className={`page-turn-scene ${forward ? "turn-forward" : "turn-backward"} ${spread === 2 ? "turn-spread" : "turn-single"}`}
      aria-hidden="true"
      inert
    >
      {spread === 2 && <div ref={stationary} className="turn-stationary" />}
      <div className="turn-ground-shadow" />
      <div
        ref={leaf}
        className="turn-leaf"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) done();
        }}
      >
        <div ref={front} className="turn-face turn-front" />
        <div ref={back} className="turn-face turn-back" />
      </div>
    </div>
  );
}
