import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./contents-drawer.css";

/** Fill each desktop column downwards, then use the next column. */
export default function ContentsDrawer({
  count,
  children,
  onClose,
}: {
  count: number;
  children: ReactNode;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState({
    columns: 1,
    rows: Math.max(1, count),
  });
  useLayoutEffect(() => {
    const drawer = root.current!,
      list = drawer.querySelector<HTMLElement>(".chapter-list")!;
    const measure = () => {
      const desktop = window.matchMedia("(min-width: 761px)").matches;
      const item = list.querySelector<HTMLElement>("button");
      const capacity = Math.max(
        1,
        Math.floor(list.clientHeight / (item?.offsetHeight || 92)),
      );
      const available = Math.max(
        1,
        Math.min(4, Math.floor((window.innerWidth - 48) / 330)),
      );
      const columns = desktop
        ? Math.min(available, Math.max(1, Math.ceil(count / capacity)))
        : 1;
      const rows = Math.max(1, Math.ceil(count / columns));
      setLayout((old) =>
        old.columns === columns && old.rows === rows ? old : { columns, rows },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [count]);
  useLayoutEffect(() => {
    const list = root.current!.querySelector<HTMLElement>(".chapter-list")!;
    const selected = list.querySelector<HTMLElement>(".selected");
    if (!selected) return;
    const outer = list.getBoundingClientRect(),
      inner = selected.getBoundingClientRect();
    if (inner.top < outer.top) list.scrollTop += inner.top - outer.top;
    else if (inner.bottom > outer.bottom)
      list.scrollTop += inner.bottom - outer.bottom;
  }, [layout]);
  return (
    <aside
      ref={root}
      className="contents-drawer adaptive-contents"
      id="chapter-contents"
      aria-label="Chapter contents"
      style={
        {
          "--contents-columns": layout.columns,
          "--contents-rows": layout.rows,
        } as CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {children}
    </aside>
  );
}
