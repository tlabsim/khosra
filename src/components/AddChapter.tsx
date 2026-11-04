import { useState } from "react";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import type { Chapter } from "../domain/model";

export default function AddChapter({
  chapters,
  language,
  hasPreface,
  onAdd,
}: {
  chapters: Chapter[];
  language: string;
  hasPreface: boolean;
  onAdd: (
    title: string,
    options: { afterChapterId: string | null; preface: boolean },
  ) => void;
}) {
  const [preface, setPreface] = useState(false);
  const [title, setTitle] = useState("");
  const [after, setAfter] = useState(chapters.at(-1)?.id || "");
  const prefaceTitle = language === "bn" ? "ভূমিকা" : "Preface";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(title, {
          afterChapterId: preface ? null : after || null,
          preface,
        });
      }}
    >
      <label>
        Type
        <select
          value={preface ? "preface" : "chapter"}
          onChange={(e) => {
            const next = e.target.value === "preface";
            setPreface(next);
            if (next && !title.trim()) setTitle(prefaceTitle);
            else if (!next && title === prefaceTitle) setTitle("");
          }}
        >
          <option value="chapter">Chapter</option>
          <option value="preface" disabled={hasPreface}>
            Preface / ভূমিকা · Chapter 0
          </option>
        </select>
      </label>
      {hasPreface && (
        <p className="muted">
          A preface already exists. If it is in Deleted chapters, restore it
          there.
        </p>
      )}
      <label>
        Chapter title
        <input
          name="title"
          required
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      {preface ? (
        <p className="muted">Chapter 0 · Before the first chapter.</p>
      ) : (
        <label>
          Position
          <select value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="">
              At beginning
              {chapters.some((c) => c.code === 0) ? " (after preface)" : ""}
            </option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                After {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="button primary" type="submit">
        Add {preface ? "preface" : "chapter"}
        <Plus />
      </button>
    </form>
  );
}
