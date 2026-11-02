import ShareIcon from "./ShareIcon";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useSyncExternalStore, type ElementType } from "react";
const mobileQuery = "(max-width: 760px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const isMobile = () => window.matchMedia(mobileQuery).matches;

type Item = { id: string; label: string; icon: ElementType; count?: number };
export default function WorkspaceNav({
  items,
  current,
  onChange,
  onShare,
  onAddChapter,
  chapterNavigation,
}: {
  items: Item[];
  current: string;
  onChange: (id: string) => void;
  onShare?: () => void;
  onAddChapter: () => void;
  chapterNavigation?: { previous?: () => void; next?: () => void };
}) {
  const mobile = useSyncExternalStore(subscribe, isMobile);
  const order = ["flags", "review", "manuscript", "history", "context"];
  const visibleItems = mobile
    ? [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : items;
  return (
    <nav
      className="folio-tabs tool-rail workspace-nav"
      aria-label="Chapter workspace"
    >
      <div className="workspace-options">
        {visibleItems.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            data-section={id}
            aria-label={label}
            title={label}
            className={current === id ? "active" : ""}
            aria-current={current === id ? "page" : undefined}
            onClick={() => onChange(id)}
          >
            <Icon size={20} />
            <span className="tool-label">{label}</span>
            {!!count && <span className="count">{count}</span>}
          </button>
        ))}
        {!mobile && onShare && (
          <>
            <span className="workspace-nav-divider" aria-hidden="true" />
            <button
              className="workspace-share"
              aria-label="Share manuscript"
              title="Share manuscript"
              onClick={onShare}
            >
              <ShareIcon />
              <span className="tool-label">Share</span>
            </button>
          </>
        )}
      </div>
      {!mobile && (
        <div className="workspace-chapter-shortcuts">
          <button
            className="workspace-add-chapter"
            aria-label="Add chapter"
            title="Add chapter"
            onClick={onAddChapter}
          >
            <Plus size={28} aria-hidden="true" />
            <span className="tool-label">Add chapter</span>
          </button>
          {chapterNavigation && (
            <div
              className="workspace-chapter-navigation"
              role="group"
              aria-label="Switch chapter"
            >
              <button
                aria-label="Previous chapter"
                title="Previous chapter"
                disabled={!chapterNavigation.previous}
                onClick={chapterNavigation.previous}
              >
                <CaretLeft size={18} aria-hidden="true" />
              </button>
              <button
                aria-label="Next chapter"
                title="Next chapter"
                disabled={!chapterNavigation.next}
                onClick={chapterNavigation.next}
              >
                <CaretRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
