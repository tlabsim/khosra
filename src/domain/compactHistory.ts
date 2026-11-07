import type { Paragraph, State } from "./model";

/** Compact only immutable history. Equal blocks share a frozen object; changed
 * text, labels and section headings remain distinct. JSON archives are unchanged. */
export function compactHistory(state: State): State {
  const protectedBlocks = new WeakSet<object>();
  // JSON parsers may keep short slices backed by a much larger response string.
  // Detach retained text without changing UTF-16, including unpaired surrogates.
  const copyText = (text: string) => {
    if (text.length < 13) return text;
    if (text.length <= 1024) return text.split("").join("");
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 1024)
      chunks.push(text.slice(i, i + 1024));
    return chunks.join("");
  };
  const protect = (p: Paragraph, previous?: Paragraph) => {
    const block = Object.freeze({
      ...p,
      id: previous?.id ?? copyText(p.id),
      text: previous?.text === p.text ? previous.text : copyText(p.text),
      section:
        previous?.section === p.section
          ? previous.section
          : copyText(p.section),
    });
    protectedBlocks.add(block);
    return block;
  };
  const blocks = new Map<
    string,
    { last: Paragraph; variants?: Map<string, Paragraph> }
  >();
  const key = (p: Paragraph) => JSON.stringify([p.label, p.section, p.text]);
  const compact = {
    ...state,
    revisions: state.revisions.map((revision) => ({
      ...revision,
      paragraphs: revision.paragraphs.map((p) => {
        const known = blocks.get(p.id);
        if (!known) {
          const block = protect(p);
          blocks.set(p.id, { last: block });
          return block;
        }
        const last = known.last;
        if (
          p.label === last.label &&
          p.section === last.section &&
          p.text === last.text
        )
          return last;
        known.variants ??= new Map([[key(last), last]]);
        const identity = key(p),
          cached = known.variants.get(identity);
        if (cached) {
          known.last = cached;
          return cached;
        }
        const block = protect(p, last);
        known.variants.set(identity, block);
        known.last = block;
        return block;
      }),
    })),
  };
  const detach = (value: unknown): unknown => {
    if (typeof value === "string") return copyText(value);
    if (!value || typeof value !== "object" || protectedBlocks.has(value))
      return value;
    if (Array.isArray(value)) return value.map(detach);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, detach(item)]),
    );
  };
  return detach(compact) as State;
}
