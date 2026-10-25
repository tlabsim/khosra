import { useEffect, useState, type RefObject } from "react";

export default function ReadingProgress({
  paged,
  page,
  pages,
  spread,
  hasText,
  root,
  text,
}: {
  paged: boolean;
  page: number;
  pages: number;
  spread: number;
  hasText: boolean;
  root: RefObject<HTMLElement | null>;
  text: RefObject<HTMLElement | null>;
}) {
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    if (paged) return;
    let active = true,
      frame = 0;
    const measure = () => {
      frame = 0;
      if (!active || !root.current || !text.current) return;
      const bounds = text.current.getBoundingClientRect();
      const bottom = Math.min(
        window.innerHeight,
        root.current.getBoundingClientRect().bottom,
      );
      setScrollProgress(
        bounds.height > 0
          ? Math.max(0, Math.min(1, (bottom - bounds.top) / bounds.height))
          : 0,
      );
    };
    const schedule = () => {
      if (active && !frame) frame = requestAnimationFrame(measure);
    };
    const container = root.current;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    container?.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    if (text.current) observer.observe(text.current);
    if (container) observer.observe(container);
    measure();
    void document.fonts.ready.then(schedule);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      container?.removeEventListener("scroll", schedule);
    };
  }, [paged, root, text]);
  const end = Math.min(page + spread, pages);
  const amount = hasText
    ? paged
      ? end / Math.max(1, pages)
      : scrollProgress
    : 0;
  const percent = Math.round(amount * 100);
  return (
    <div
      className="reader-progress"
      role="progressbar"
      aria-label="Chapter reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={
        !hasText
          ? "No text yet"
          : paged
            ? `Page ${page + 1}${spread > 1 && end > page + 1 ? `–${end}` : ""} of ${pages}`
            : `${percent}% of chapter`
      }
    >
      <span style={{ transform: `scaleX(${amount})` }} />
    </div>
  );
}
