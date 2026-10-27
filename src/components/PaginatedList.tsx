import { useEffect, useRef, useState, type ReactNode } from "react";

const PAGE_SIZE = 100;

export default function PaginatedList<T>({
  items,
  renderItem,
  label,
  noun = "items",
  onPageChange,
  itemsClassName,
  footer,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  label: string;
  noun?: string;
  onPageChange?: () => void;
  itemsClassName?: string;
  footer?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  useEffect(() => {
    setPage((previous) => Math.min(previous, pages));
  }, [pages]);

  function changePage(next: number) {
    setPage(next);
    onPageChange?.();
    container.current?.scrollIntoView({ block: "start" });
  }

  function controls(position: "top" | "bottom") {
    if (items.length <= PAGE_SIZE) return null;
    return (
      <nav
        className="proposal-pagination"
        aria-label={`${label} pages (${position})`}
      >
        <span role={position === "top" ? "status" : undefined}>
          {start + 1}–{Math.min(start + PAGE_SIZE, items.length)} of{" "}
          {items.length} {noun}
        </span>
        <div>
          <button
            className="button"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {pages}
          </span>
          <button
            className="button"
            disabled={currentPage === pages}
            onClick={() => changePage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </nav>
    );
  }

  return (
    <div className="paginated-list" ref={container}>
      {controls("top")}
      <div className={itemsClassName}>
        {items
          .slice(start, start + PAGE_SIZE)
          .map((item, index) => renderItem(item, start + index))}
        {footer}
      </div>
      {controls("bottom")}
    </div>
  );
}
