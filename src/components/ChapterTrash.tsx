import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { head, wordCount, type State, type Chapter } from "../domain/model";
export default function ChapterTrash({
  state,
  chapters,
  language,
  onRestore,
}: {
  state: State;
  chapters: Chapter[];
  language: string;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="chapter-trash-list">
      <p className="muted">
        Restore a chapter with all its history, flags, proposals and permanent
        references. It returns near its former position.
      </p>
      {!chapters.length && <p>No deleted chapters.</p>}
      {[...chapters]
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
        .map((chapter) => {
          const revision = head(state, chapter);
          return (
            <article className="chapter-trash-item" key={chapter.id}>
              <div className="chapter-trash-heading">
                <div>
                  <h3 lang={language}>{chapter.title}</h3>
                  <p>
                    C{chapter.code} ·{" "}
                    {wordCount(
                      revision.paragraphs.map((p) => p.text).join(" "),
                    ).toLocaleString()}{" "}
                    words · Deleted{" "}
                    {new Date(chapter.deletedAt!).toLocaleDateString()}
                  </p>
                </div>
                <button
                  className="button"
                  aria-label={`Restore ${chapter.title}`}
                  onClick={() => onRestore(chapter.id)}
                >
                  <ArrowCounterClockwise size={18} />
                  Restore
                </button>
              </div>
              <details>
                <summary>Preview chapter</summary>
                <div className="chapter-trash-preview" lang={language}>
                  {revision.paragraphs.length ? (
                    revision.paragraphs.map((p) => (
                      <div key={p.id}>
                        {p.section && <h4>{p.section}</h4>}
                        <p>{p.text || "Empty paragraph"}</p>
                      </div>
                    ))
                  ) : (
                    <p>This chapter is empty.</p>
                  )}
                </div>
              </details>
            </article>
          );
        })}
    </div>
  );
}
