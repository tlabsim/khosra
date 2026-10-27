import { z } from "zod";
import { FileSchema, MaterialSchema, validateMaterials } from "./materials";
export const ParagraphSchema = z.object({
  id: z.string().uuid(),
  label: z.number().int().positive(),
  text: z.string().max(200000),
  section: z.string().max(200).default(""),
});
export const RevisionSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  createdAt: z.string(),
  source: z.enum(["author", "proposal", "restore", "reindex"]),
  paragraphs: z.array(ParagraphSchema),
  edition: z.number().int().positive(),
  message: z.string(),
});
export const ChapterSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  code: z.number().int().positive(),
  title: z.string().max(300),
  position: z.number(),
  headId: z.string().uuid(),
  approvedId: z.string().uuid().nullable(),
  synopsis: z.string().default(""),
  deletedAt: z.string().datetime().optional(),
});
export const BookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  premise: z.string(),
  language: z.enum(["bn", "en"]),
  createdAt: z.string(),
});
export const FlagSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int().positive(),
  chapterId: z.string().uuid(),
  revisionId: z.string().uuid(),
  paragraphIds: z.array(z.string().uuid()),
  audio: z.string().optional(),
  quote: z.string(),
  note: z.string().min(1),
  kind: z.enum(["rewrite", "discussion", "reference"]),
  status: z.enum(["open", "resolved"]),
  createdAt: z.string(),
});
export const ProposalSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  baseRevisionId: z.string().uuid(),
  title: z.string(),
  rationale: z.string(),
  paragraphs: z.array(ParagraphSchema),
  status: z.enum(["pending", "accepted", "rejected"]),
  createdAt: z.string(),
});
export const ContextSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  revisionId: z.string().uuid(),
  summary: z.string(),
  facts: z.array(
    z.object({
      kind: z.enum([
        "event",
        "character",
        "clue",
        "thread",
        "timeline",
        "interpretation",
      ]),
      text: z.string(),
      paragraphIds: z.array(z.string().uuid()),
    }),
  ),
  createdAt: z.string(),
});
export const StateSchema = z.object({
  schemaVersion: z.literal(1),
  books: z.array(BookSchema),
  chapters: z.array(ChapterSchema),
  revisions: z.array(RevisionSchema),
  flags: z.array(FlagSchema),
  proposals: z.array(ProposalSchema),
  contexts: z.array(ContextSchema),
  materials: z.array(MaterialSchema).default([]),
  files: z.array(FileSchema).default([]),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Book = z.infer<typeof BookSchema>;
export type Flag = z.infer<typeof FlagSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ChapterContext = z.infer<typeof ContextSchema>;
export type State = z.infer<typeof StateSchema>;
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const emptyState = (): State => ({
  schemaVersion: 1,
  books: [],
  chapters: [],
  revisions: [],
  flags: [],
  proposals: [],
  contexts: [],
  materials: [],
  files: [],
});
export function validateState(value: unknown): State {
  const s = StateSchema.parse(value);
  const unique = (rows: { id: string }[]) =>
    new Set(rows.map((x) => x.id)).size === rows.length;
  if (
    ![
      s.books,
      s.chapters,
      s.revisions,
      s.flags,
      s.proposals,
      s.contexts,
      s.materials,
      s.files,
    ].every(unique)
  )
    throw Error("Duplicate record IDs.");
  validateMaterials(s);
  const codes = new Set<string>();
  for (const c of s.chapters) {
    const code = c.bookId + ":" + c.code;
    if (codes.has(code))
      throw Error(
        "Two chapters share a short address. Keep both archives for manual reconciliation.",
      );
    codes.add(code);
    if (
      !s.books.some((b) => b.id === c.bookId) ||
      !s.revisions.some((r) => r.id === c.headId && r.chapterId === c.id)
    )
      throw Error("Broken chapter references.");
    if (
      c.approvedId &&
      !s.revisions.some((r) => r.id === c.approvedId && r.chapterId === c.id)
    )
      throw Error("Broken approved reference.");
  }
  for (const r of s.revisions) {
    if (
      r.parentId &&
      !s.revisions.some(
        (x) => x.id === r.parentId && x.chapterId === r.chapterId,
      )
    )
      throw Error("Broken parent revision.");
    if (
      !s.chapters.some((c) => c.id === r.chapterId) ||
      !unique(r.paragraphs) ||
      new Set(r.paragraphs.map((p) => p.label)).size !== r.paragraphs.length
    )
      throw Error("Invalid revision.");
  }
  for (const f of s.flags) {
    const r = s.revisions.find(
      (r) => r.id === f.revisionId && r.chapterId === f.chapterId,
    );
    if (
      !r ||
      f.paragraphIds.some((id) => !r.paragraphs.some((p) => p.id === id))
    )
      throw Error("Broken flag anchor.");
  }
  for (const p of s.proposals) {
    if (
      !s.revisions.some(
        (r) => r.id === p.baseRevisionId && r.chapterId === p.chapterId,
      ) ||
      !unique(p.paragraphs) ||
      new Set(p.paragraphs.map((x) => x.label)).size !== p.paragraphs.length
    )
      throw Error("Invalid proposal base or paragraphs.");
  }
  for (const x of s.contexts) {
    const r = s.revisions.find(
      (r) => r.id === x.revisionId && r.chapterId === x.chapterId,
    );
    if (
      !r ||
      x.facts.some((f) =>
        f.paragraphIds.some((id) => !r.paragraphs.some((p) => p.id === id)),
      )
    )
      throw Error("Invalid context source or evidence.");
  }
  type Index = {
    addresses: Map<number, string>;
    identities: Map<string, number>;
  };
  const indexes = new Map<string, Index>(),
    visiting = new Set<string>();
  const indexRevision = (r: Revision): Index => {
    const cached = indexes.get(r.id);
    if (cached) return cached;
    if (visiting.has(r.id)) throw Error("Cyclic revision history.");
    visiting.add(r.id);
    const parent = s.revisions.find((x) => x.id === r.parentId);
    const inherited =
      parent && parent.edition === r.edition
        ? indexRevision(parent)
        : undefined;
    const index: Index = {
      addresses: new Map(inherited?.addresses),
      identities: new Map(inherited?.identities),
    };
    for (const p of r.paragraphs) {
      if (
        (index.addresses.has(p.label) &&
          index.addresses.get(p.label) !== p.id) ||
        (index.identities.has(p.id) && index.identities.get(p.id) !== p.label)
      )
        throw Error(
          "Paragraph references cannot be reassigned within an edition. Renumber explicitly.",
        );
      index.addresses.set(p.label, p.id);
      index.identities.set(p.id, p.label);
    }
    visiting.delete(r.id);
    indexes.set(r.id, index);
    return index;
  };
  for (const r of s.revisions) indexRevision(r);
  for (const p of s.proposals) {
    const base = s.revisions.find((r) => r.id === p.baseRevisionId)!;
    const index = indexRevision(base);
    for (const block of p.paragraphs) {
      if (
        (index.addresses.has(block.label) &&
          index.addresses.get(block.label) !== block.id) ||
        (index.identities.has(block.id) &&
          index.identities.get(block.id) !== block.label)
      )
        throw Error("Proposal changes stable paragraph references.");
    }
  }
  return s;
}
export function head(s: State, c: Chapter) {
  const r = s.revisions.find((r) => r.id === c.headId);
  if (!r) throw Error("Missing revision");
  return r;
}
export function reference(c: Chapter, r: Revision, p?: Paragraph) {
  return `R${r.edition}:C${c.code}${p ? `-P${p.label}` : ""}`;
}
export function commit(
  s: State,
  chapterId: string,
  baseId: string,
  paragraphs: Paragraph[],
  message: string,
  source: Revision["source"] = "author",
): State {
  const c = s.chapters.find((c) => c.id === chapterId);
  if (!c || c.headId !== baseId)
    throw Error(
      "This chapter changed. Review the latest revision before applying your changes.",
    );
  const base = head(s, c);
  const r: Revision = {
    id: uid(),
    chapterId,
    parentId: baseId,
    paragraphs: structuredClone(paragraphs),
    edition: base.edition,
    createdAt: now(),
    source,
    message,
  };
  return validateState({
    ...s,
    chapters: s.chapters.map((x) =>
      x.id === c.id ? { ...x, headId: r.id } : x,
    ),
    revisions: [...s.revisions, r],
  });
}
export function acceptProposal(
  s: State,
  p: Proposal,
  paragraphs = p.paragraphs,
) {
  if (p.status !== "pending") throw Error("Proposal already reviewed.");
  const next = commit(
    s,
    p.chapterId,
    p.baseRevisionId,
    paragraphs,
    p.title +
      (JSON.stringify(paragraphs) !== JSON.stringify(p.paragraphs)
        ? " · edited by author before acceptance"
        : ""),
    "proposal",
  );
  return {
    ...next,
    proposals: next.proposals.map((x) =>
      x.id === p.id ? { ...x, status: "accepted" as const } : x,
    ),
  };
}
export function addChapter(s: State, bookId: string, title: string): State {
  const id = uid(),
    rid = uid();
  const siblings = s.chapters.filter((c) => c.bookId === bookId);
  return {
    ...s,
    chapters: [
      ...s.chapters,
      {
        id,
        bookId,
        title,
        code: Math.max(0, ...siblings.map((c) => c.code)) + 1,
        position: Math.max(-1, ...siblings.map((c) => c.position)) + 1,
        headId: rid,
        approvedId: null,
        synopsis: "",
      },
    ],
    revisions: [
      ...s.revisions,
      {
        id: rid,
        chapterId: id,
        parentId: null,
        createdAt: now(),
        source: "author",
        paragraphs: [{ id: uid(), label: 1, text: "", section: "" }],
        edition: 1,
        message: "Chapter created",
      },
    ],
  };
}
export function renumber(s: State, c: Chapter): State {
  const base = head(s, c);
  const r: Revision = {
    ...base,
    id: uid(),
    parentId: base.id,
    createdAt: now(),
    source: "reindex",
    message: "References renumbered",
    edition: base.edition + 1,
    paragraphs: base.paragraphs.map((p, i) => ({ ...p, label: i + 1 })),
  };
  return validateState({
    ...s,
    chapters: s.chapters.map((x) =>
      x.id === c.id ? { ...x, headId: r.id } : x,
    ),
    revisions: [...s.revisions, r],
  });
}
export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function nextParagraphLabel(s: State, c: Chapter): number {
  const edition = head(s, c).edition;
  return (
    1 +
    Math.max(
      0,
      ...s.revisions
        .filter((r) => r.chapterId === c.id && r.edition === edition)
        .flatMap((r) => r.paragraphs.map((p) => p.label)),
    )
  );
}
/** Preserve exact matches; the untouched initial P1 becomes the first imported paragraph. */
export function chapterReplacement(
  s: State,
  c: Chapter,
  texts: string[],
): Paragraph[] {
  const current = head(s, c);
  const initial =
    current.parentId === null &&
    current.paragraphs.length === 1 &&
    current.paragraphs[0].label === 1 &&
    current.paragraphs[0].text === "" &&
    current.paragraphs[0].section === ""
      ? current.paragraphs[0]
      : null;
  let label = nextParagraphLabel(s, c);
  const used = new Set<string>();
  return texts.map((text, index) => {
    const match = current.paragraphs.find(
      (p) => p.text === text && !used.has(p.id),
    );
    if (match) {
      used.add(match.id);
      return match;
    }
    if (index === 0 && initial) {
      used.add(initial.id);
      return { ...initial, text };
    }
    return { id: uid(), label: label++, text, section: "" };
  });
}
export function reincorporate(
  s: State,
  c: Chapter,
  old: Paragraph[],
): Paragraph[] {
  const current = head(s, c);
  let label = nextParagraphLabel(s, c);
  return old.map((p) => ({
    ...p,
    label: current.paragraphs.find((x) => x.id === p.id)?.label ?? label++,
  }));
}
