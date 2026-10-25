import { Notebook } from "@phosphor-icons/react/dist/csr/Notebook";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Leaf } from "@phosphor-icons/react/dist/csr/Leaf";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { head, wordCount, type State, type Book } from "../domain/model";
import Empty from "./Empty";
export default function Library({
  state,
  onOpen,
  onCreate,
  onRestore,
}: {
  state: State;
  onOpen: (book: Book) => void;
  onCreate: () => void;
  onRestore: () => void;
}) {
  if (!state.books.length)
    return (
      <main className="library library-empty">
        <Empty
          icon={Notebook}
          title="No manuscripts yet"
          text="Create a manuscript or restore an archive."
        >
          <button className="button primary" onClick={onCreate}>
            Begin a manuscript
            <ArrowRight size={18} />
          </button>
          <button className="button quiet" onClick={onRestore}>
            <UploadSimple size={18} />
            Restore a Khosra archive
          </button>
        </Empty>
      </main>
    );
  return (
    <main className="library">
      <div className="library-heading">
        <h1>Manuscripts</h1>
        <button className="button quiet" onClick={onRestore}>
          <UploadSimple />
          Restore archive
        </button>
      </div>
      <div className="bookshelf">
        {state.books.map((b, i) => {
          const chapters = state.chapters.filter(
            (c) => c.bookId === b.id && !c.deletedAt,
          );
          const words = chapters.reduce(
            (n, c) =>
              n +
              wordCount(
                head(state, c)
                  .paragraphs.map((p) => p.text)
                  .join(" "),
              ),
            0,
          );
          return (
            <button
              className={`library-book cover-${i % 3}`}
              key={b.id}
              onClick={() => onOpen(b)}
              aria-label={`Open ${b.title}`}
            >
              <span className="book-cover">
                <span className="cover-mark">
                  <Leaf size={22} weight="light" />
                </span>
                <strong lang={b.language}>{b.title}</strong>
                <span className="cover-rule" />
                <span className="cover-language">
                  {b.language === "bn" ? "বাংলা" : "English"}
                </span>
                <span className="cover-spine" />
              </span>
              <span className="book-caption">
                <span>
                  {chapters.length}{" "}
                  {chapters.length === 1 ? "chapter" : "chapters"}
                </span>
                <span>{words.toLocaleString()} words</span>
                <ArrowRight size={18} />
              </span>
            </button>
          );
        })}
        <button className="new-book-tile" onClick={onCreate}>
          <span>
            <Plus size={28} weight="light" />
          </span>
          New manuscript
        </button>
      </div>
    </main>
  );
}
