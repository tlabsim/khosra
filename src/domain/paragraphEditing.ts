import { uid, type Paragraph } from "./model";
export type ParagraphEdit = {
  paragraphs: Paragraph[];
  activeId: string | null;
  caret: number;
};
export function splitParagraph(
  ps: Paragraph[],
  id: string,
  text: string,
  start: number,
  end: number,
  label: number,
): ParagraphEdit {
  const index = ps.findIndex((p) => p.id === id);
  if (index < 0) throw new Error("Paragraph no longer exists.");
  const original = ps[index];
  const fresh: Paragraph = { id: uid(), label, text: "", section: "" };
  const before = text.slice(0, start),
    after = text.slice(end);
  // Inserting a blank before existing prose must retain that prose's address.
  const pair =
    start === 0
      ? [fresh, { ...original, text: after }]
      : [
          { ...original, text: before },
          { ...fresh, text: after },
        ];
  return {
    paragraphs: [...ps.slice(0, index), ...pair, ...ps.slice(index + 1)],
    activeId: pair[1].id,
    caret: 0,
  };
}
export function joinParagraph(
  ps: Paragraph[],
  id: string,
  text: string,
  direction: -1 | 1,
): ParagraphEdit | null {
  const index = ps.findIndex((p) => p.id === id),
    other = index + direction;
  if (index < 0 || other < 0 || other >= ps.length) return null;
  const left = direction === -1 ? ps[other] : { ...ps[index], text };
  const right = direction === -1 ? { ...ps[index], text } : ps[other];
  if (right.section)
    throw new Error(
      "Remove the subsection heading before joining these paragraphs.",
    );
  const first = Math.min(index, other);
  return {
    paragraphs: [
      ...ps.slice(0, first),
      { ...left, text: left.text + right.text },
      ...ps.slice(first + 2),
    ],
    activeId: left.id,
    caret: left.text.length,
  };
}
export function deleteParagraph(ps: Paragraph[], id: string): ParagraphEdit {
  const index = ps.findIndex((p) => p.id === id);
  if (index < 0) throw new Error("Paragraph no longer exists.");
  const paragraphs = ps.filter((p) => p.id !== id),
    active = paragraphs[index] || paragraphs[index - 1];
  return {
    paragraphs,
    activeId: active?.id || null,
    caret: paragraphs[index] ? 0 : active?.text.length || 0,
  };
}
