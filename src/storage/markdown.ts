import type { Paragraph } from "../domain/model";

/** Preserve manual line breaks as Markdown hard breaks, and blank lines as paragraphs. */
function prose(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line, i) =>
      line.trim() && lines[i + 1]?.trim() ? `${line}  ` : line,
    )
    .join("\n");
}

export function manuscriptMarkdown(
  chapters: readonly {
    title: string;
    paragraphs: readonly Pick<Paragraph, "text" | "section">[];
  }[],
): string {
  return chapters
    .map(
      (chapter) =>
        `# ${chapter.title}\n\n${chapter.paragraphs
          .map((p) =>
            p.section ? `## ${p.section}\n\n${prose(p.text)}` : prose(p.text),
          )
          .join("\n\n")}`,
    )
    .join("\n\n");
}
