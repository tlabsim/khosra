export type TextRange = { start: number; end: number };
export type ParagraphBreaks = "auto" | "blank" | "line";
const blankBreaks = /\n(?:[\t ]*\n)+/g;

/** Normalize transport line endings without rewriting Unicode prose or spaces. */
export function normalizeChapterText(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\u2029/g, "\n\n");
}
export function plainTextParagraphs(
  text: string,
  mode: ParagraphBreaks = "auto",
) {
  const normalized = normalizeChapterText(text);
  const delimiter =
    mode === "line" || (mode === "auto" && !/\n[\t ]*\n/.test(normalized))
      ? /\n/
      : /\n(?:[\t ]*\n)+/;
  return normalized
    .split(delimiter)
    .map((p) => p.replace(/[\u000b\u2028]/g, "\n"))
    .filter((p) => p.trim());
}

/** A draft contains ordinary text only; metadata distinguishes existing soft breaks. */
export function paragraphDraft(paragraphs: string[]) {
  let text = "";
  const protectedBreaks: TextRange[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index) text += "\n\n";
    const offset = text.length;
    for (const match of paragraph.matchAll(/\n(?:[\t ]*\n)*/g)) {
      protectedBreaks.push({
        start: offset + match.index!,
        end: offset + match.index! + match[0].length,
      });
    }
    text += paragraph;
  });
  return { text, protectedBreaks };
}
export function parseChapterDraft(
  text: string,
  mode: ParagraphBreaks,
  protectedBreaks: TextRange[],
) {
  if (mode === "line") return plainTextParagraphs(text, "line");
  const protectedRanges =
    mode === "auto"
      ? [...protectedBreaks].sort((a, b) => a.start - b.start)
      : [];
  const separators: TextRange[] = [];
  const collect = (start: number, end: number) => {
    for (const match of text
      .slice(start, end)
      .matchAll(new RegExp(blankBreaks.source, "g"))) {
      separators.push({
        start: start + match.index!,
        end: start + match.index! + match[0].length,
      });
    }
  };
  let index = 0;
  for (const match of text.matchAll(new RegExp(blankBreaks.source, "g"))) {
    let cursor = match.index!;
    const end = cursor + match[0].length;
    while (
      index < protectedRanges.length &&
      protectedRanges[index].end <= cursor
    )
      index++;
    for (
      let i = index;
      i < protectedRanges.length && protectedRanges[i].start < end;
      i++
    ) {
      const range = protectedRanges[i];
      if (range.start > cursor) collect(cursor, range.start);
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < end) collect(cursor, end);
  }
  const result: string[] = [];
  let start = 0;
  for (const separator of separators) {
    result.push(text.slice(start, separator.start));
    start = separator.end;
  }
  result.push(text.slice(start));
  return result.filter((p) => p.trim());
}
export function replaceBreakRanges(
  ranges: TextRange[],
  start: number,
  end: number,
  insertedLength: number,
) {
  const delta = insertedLength - (end - start);
  return ranges.flatMap((r) =>
    r.end <= start
      ? [r]
      : r.start >= end
        ? [{ start: r.start + delta, end: r.end + delta }]
        : [],
  );
}
export function editBreakRanges(
  before: string,
  after: string,
  ranges: TextRange[],
) {
  let start = 0,
    suffix = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const oldEnd = before.length - suffix;
  const newlineEdit =
    before.slice(start, oldEnd).includes("\n") ||
    after.slice(start, after.length - suffix).includes("\n");
  const retained = newlineEdit
    ? ranges.filter((r) => r.end < start || r.start > oldEnd)
    : ranges;
  return replaceBreakRanges(
    retained,
    start,
    oldEnd,
    after.length - suffix - start,
  );
}

const blocks = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
  "TR",
]);
const excluded = new Set([
  "SCRIPT",
  "STYLE",
  "META",
  "LINK",
  "TITLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "IMG",
  "SVG",
  "MATH",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "FORM",
  "INPUT",
  "BUTTON",
  "SELECT",
  "TEXTAREA",
]);
/** Clipboard HTML is parsed in an inert template and never inserted into the page. */
export function htmlParagraphs(html: string): string[] | null {
  if (!html || typeof document === "undefined") return null;
  const template = document.createElement("template");
  const start = /<!--\s*StartFragment\s*-->/i.exec(html);
  const end = /<!--\s*EndFragment\s*-->/i.exec(html);
  template.innerHTML =
    start && end && end.index > start.index
      ? html.slice(start.index + start[0].length, end.index)
      : html;
  const paragraphs: string[] = [];
  let buffer = "",
    blockCount = 0,
    preserveEnd = false;
  const flush = () => {
    const paragraph = preserveEnd ? buffer : buffer.replace(/ +$/u, "");
    if (paragraph.trim()) paragraphs.push(paragraph);
    buffer = "";
    preserveEnd = false;
  };
  const walk = (node: Node, preserve = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let value = normalizeChapterText(node.nodeValue || "");
      if (!preserve) {
        value = value.replace(/[\t\n\f ]+/g, " ");
        if (!buffer || /[ \n]$/.test(buffer)) value = value.replace(/^ +/, "");
      }
      buffer += value;
      preserveEnd = preserve;
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toUpperCase();
    if (
      excluded.has(tag) ||
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)/i.test(
        node.getAttribute("style") || "",
      )
    )
      return;
    if (tag === "O:P" && !node.textContent?.trim()) return;
    if (tag === "BR") {
      buffer = buffer.replace(/ +$/, "") + "\n";
      preserveEnd = true;
      return;
    }
    const block = blocks.has(tag);
    if (block) {
      blockCount++;
      flush();
    }
    const literal =
      preserve ||
      tag === "PRE" ||
      /(?:mso-spacerun\s*:\s*yes|white-space\s*:\s*pre)/i.test(
        node.getAttribute("style") || "",
      );
    node.childNodes.forEach((child) => walk(child, literal));
    if (block) flush();
  };
  template.content.childNodes.forEach((node) => walk(node));
  flush();
  return blockCount && paragraphs.length ? paragraphs : null;
}
