import type { Paragraph, Revision } from "./model";

// Compare actual parent snapshots, including edits hidden in session groups.
export function removedPassages(revision: Revision, parent?: Revision) {
  return (parent?.paragraphs || []).flatMap((p) => {
    const next = revision.paragraphs.find((x) => x.id === p.id);
    if (
      (!next && (p.text.trim() || p.section.trim())) ||
      (next && p.text.trim() && !next.text.trim())
    )
      return [
        {
          paragraph: p,
          kind: next ? ("cleared" as const) : ("deleted" as const),
        },
      ];
    return [];
  });
}
export function restoreParagraph(
  current: Paragraph[],
  source: Paragraph[],
  id: string,
  unusedLabel: number,
  referenceParagraphs: Paragraph[] = current,
): Paragraph[] {
  const index = source.findIndex((p) => p.id === id);
  if (index < 0) throw Error("The original paragraph is unavailable.");
  const p = source[index],
    existing = current.find((x) => x.id === id);
  if (existing) {
    if (existing.text.trim())
      throw Error(
        "This paragraph already has text. Read the earlier revision to compare it.",
      );
    return current.map((x) =>
      x.id === id ? { ...x, text: p.text, section: x.section || p.section } : x,
    );
  }
  // Keep the original address unless explicit renumbering has reused its label.
  const restored = {
    ...p,
    label:
      referenceParagraphs.find((x) => x.id === p.id)?.label ??
      (referenceParagraphs.some((x) => x.label === p.label)
        ? unusedLabel
        : p.label),
  };
  const following = source
    .slice(index + 1)
    .find((x) => current.some((y) => y.id === x.id));
  const preceding = source
    .slice(0, index)
    .reverse()
    .find((x) => current.some((y) => y.id === x.id));
  const at = following
    ? current.findIndex((x) => x.id === following.id)
    : preceding
      ? current.findIndex((x) => x.id === preceding.id) + 1
      : current.length;
  return [...current.slice(0, at), restored, ...current.slice(at)];
}

// Labels are permanent along the current edition's ancestry, even after deletion.
export function editionReferences(
  revisions: Revision[],
  current: Revision,
): Paragraph[] {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const seen = new Set<string>(),
    paragraphs: Paragraph[] = [];
  let r: Revision | undefined = current;
  while (r && r.edition === current.edition && !seen.has(r.id)) {
    seen.add(r.id);
    paragraphs.push(...r.paragraphs);
    r = byId.get(r.parentId || "");
  }
  return paragraphs;
}
