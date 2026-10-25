import type { ReaderComment } from "./contracts";
export default function Comments({ comments }: { comments: ReaderComment[] }) {
  return (
    <div className="reader-comments">
      {comments.length ? (
        comments.map((c) => (
          <article key={c.id}>
            <small>
              {c.chapter_title}
              {c.paragraph_id ? ` · P${c.paragraph_label}` : ""} ·{" "}
              {new Date(c.created_at * 1000).toLocaleString()}
            </small>
            {c.quote && <blockquote>{c.quote}</blockquote>}
            <p>{c.comment_text}</p>
          </article>
        ))
      ) : (
        <p className="caption">No feedback yet.</p>
      )}
    </div>
  );
}
