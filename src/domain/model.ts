import {
  ChapterCleanupSchema,
  validateChapterCleanups,
} from "./chapterCleanupSchema";
import { proposalChanges, selectProposalChanges } from "./proposalSelection";
import { z } from "zod";
import {
  mergeProposal,
  validProposalChoices,
  type ProposalResolution,
} from "./proposalMerge";
import {
  FileSchema,
  MaterialSchema,
  MaterialDeletionSchema,
  validateMaterials,
} from "./materials";
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
  status: z.enum(["pending", "accepted", "partially-accepted", "rejected"]),
  review: z
    .object({
      reviewedRevisionId: z.string().uuid(),
      resultRevisionId: z.string().uuid(),
      createdAt: z.string(),
      choices: z.array(
        z.object({ id: z.string(), choice: z.enum(["current", "proposal"]) }),
      ),
      selectedChangeIds: z.array(z.string().uuid()),
      declinedChangeIds: z.array(z.string().uuid()),
      paragraphs: z.array(ParagraphSchema),
    })
    .optional(),
  createdAt: z.string(),
});
export const ChapterProposalSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  title: z
    .string()
    .min(1)
    .max(300)
    .refine((value) => value.trim().length > 0),
  synopsis: z.string().max(200000),
  rationale: z.string().max(200000),
  afterChapterId: z.string().uuid().nullable(),
  paragraphs: z.array(ParagraphSchema).min(1).max(20000),
  status: z.enum(["pending", "accepted", "rejected"]),
  review: z
    .object({
      chapterId: z.string().uuid(),
      revisionId: z.string().uuid(),
      title: z
        .string()
        .min(1)
        .max(300)
        .refine((value) => value.trim().length > 0),
      synopsis: z.string().max(200000),
      afterChapterId: z.string().uuid().nullable(),
      createdAt: z.string().datetime(),
    })
    .optional(),
  createdAt: z.string().datetime(),
});
export type ChapterProposal = z.infer<typeof ChapterProposalSchema>;
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
  chapterProposals: z.array(ChapterProposalSchema).default([]),
  materials: z.array(MaterialSchema).default([]),
  files: z.array(FileSchema).default([]),
  materialDeletions: z.array(MaterialDeletionSchema).default([]),
  chapterCleanups: z.array(ChapterCleanupSchema).default([]),
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
  chapterProposals: [],
  materials: [],
  files: [],
  materialDeletions: [],
  chapterCleanups: [],
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
      s.chapterProposals,
      s.contexts,
      s.materials,
      s.files,
      s.materialDeletions,
      s.chapterCleanups,
    ].every(unique)
  )
    throw Error("Duplicate record IDs.");
  validateMaterials(s);
  validateChapterCleanups(s);
  for (const p of s.chapterProposals) {
    const validAnchor = (id: string | null) =>
      id === null ||
      s.chapters.some((c) => c.id === id && c.bookId === p.bookId);
    if (
      !s.books.some((b) => b.id === p.bookId) ||
      !validAnchor(p.afterChapterId) ||
      !unique(p.paragraphs) ||
      new Set(p.paragraphs.map((x) => x.label)).size !== p.paragraphs.length
    )
      throw Error("Invalid new-chapter proposal.");
    if ((p.status === "accepted") !== !!p.review)
      throw Error("Invalid chapter creation receipt.");
    if (p.review) {
      const c = s.chapters.find(
        (c) => c.id === p.review!.chapterId && c.bookId === p.bookId,
      );
      const r = s.revisions.find(
        (r) => r.id === p.review!.revisionId && r.chapterId === c?.id,
      );
      if (
        !c ||
        c.id !== p.id ||
        !r ||
        r.parentId !== null ||
        r.source !== "proposal" ||
        !r.paragraphs.length ||
        p.review.afterChapterId === c.id ||
        !validAnchor(p.review.afterChapterId)
      )
        throw Error("Invalid created chapter references.");
    }
  }
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
  for (const p of s.proposals) {
    if (p.status === "partially-accepted" && !p.review)
      throw Error("Partial acceptance requires a review record.");
    if (!p.review) continue;
    const review = p.review;
    const source = s.revisions.find((r) => r.id === p.baseRevisionId)!;
    const reviewed = s.revisions.find(
      (r) => r.id === review.reviewedRevisionId && r.chapterId === p.chapterId,
    );
    const result = s.revisions.find(
      (r) => r.id === review.resultRevisionId && r.chapterId === p.chapterId,
    );
    const ids = proposalChanges(source.paragraphs, review.paragraphs).flatMap(
      (g) => g.paragraphIds,
    );
    selectProposalChanges(
      source.paragraphs,
      review.paragraphs,
      review.selectedChangeIds,
    );
    const selectedSet = new Set(review.selectedChangeIds);
    const declined = ids.filter((id) => !selectedSet.has(id));
    if (
      !reviewed ||
      !result ||
      result.parentId !== reviewed.id ||
      result.source !== "proposal" ||
      !unique(review.paragraphs) ||
      new Set(review.paragraphs.map((x) => x.label)).size !==
        review.paragraphs.length ||
      JSON.stringify([...declined].sort()) !==
        JSON.stringify([...review.declinedChangeIds].sort()) ||
      !["accepted", "partially-accepted"].includes(p.status) ||
      (p.status === "partially-accepted") !== declined.length > 0 ||
      (p.status === "partially-accepted" && !review.selectedChangeIds.length)
    )
      throw Error("Invalid proposal review record.");
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
    for (const block of [...p.paragraphs, ...(p.review?.paragraphs ?? [])]) {
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
export function labelProposalParagraphs(
  s: State,
  chapter: Chapter,
  current: Revision,
  paragraphs: Paragraph[],
): Paragraph[] {
  // Preserve the latest edition's addresses, including labels reserved by older
  // snapshots. Concurrent/new insertions must never steal an existing address.
  const labels = new Map<number, string>(),
    identities = new Map<string, number>();
  for (const r of s.revisions.filter(
    (r) => r.chapterId === chapter.id && r.edition === current.edition,
  ))
    for (const block of r.paragraphs) {
      if (!labels.has(block.label)) labels.set(block.label, block.id);
      if (!identities.has(block.id)) identities.set(block.id, block.label);
    }
  for (const block of current.paragraphs) {
    labels.set(block.label, block.id);
    identities.set(block.id, block.label);
  }
  let nextLabel = nextParagraphLabel(s, chapter);
  return paragraphs.map((block) => {
    let label = identities.get(block.id) ?? block.label;
    if (labels.has(label) && labels.get(label) !== block.id) {
      while (labels.has(nextLabel)) nextLabel++;
      label = nextLabel++;
    }
    labels.set(label, block.id);
    identities.set(block.id, label);
    return { ...block, label };
  });
}
export function acceptProposal(
  s: State,
  p: Proposal,
  paragraphs = p.paragraphs,
  resolution?: ProposalResolution,
) {
  const saved = s.proposals.find((item) => item.id === p.id);
  if (!saved || saved.status !== "pending" || p.status !== "pending")
    throw Error("Proposal already reviewed or missing.");
  const chapter = s.chapters.find((c) => c.id === saved.chapterId);
  const original = s.revisions.find(
    (r) => r.id === saved.baseRevisionId && r.chapterId === saved.chapterId,
  );
  if (!chapter || !original) throw Error("Missing proposal source.");
  if (chapter.deletedAt)
    throw Error("Restore this chapter from Trash before accepting a proposal.");
  const current = head(s, chapter);
  let choices = resolution?.choices ?? {};
  if (
    resolution &&
    resolution.revisionId !== current.id &&
    Object.keys(choices).length
  ) {
    const reviewed = s.revisions.find(
      (r) => r.id === resolution.revisionId && r.chapterId === chapter.id,
    );
    if (!reviewed)
      throw Error("Missing reviewed revision. Review the latest draft.");
    choices = validProposalChoices(
      reviewed.paragraphs,
      current.paragraphs,
      choices,
    );
  }
  if (resolution?.selectedChangeIds && resolution.revisionId !== current.id)
    throw Error(
      "Your draft changed. Review the latest draft before confirming.",
    );
  const groups = proposalChanges(original.paragraphs, paragraphs);
  const allIds = groups.flatMap((g) => g.paragraphIds);
  const selectedIds = resolution?.selectedChangeIds ?? allIds;
  const selectedParagraphs = selectProposalChanges(
    original.paragraphs,
    paragraphs,
    selectedIds,
  );
  if (resolution?.selectedChangeIds && !selectedIds.length)
    throw Error("Select at least one proposed change.");
  const selectedSet = new Set(selectedIds);
  const declinedIds = allIds.filter((id) => !selectedSet.has(id));
  const merged = mergeProposal(
    original.paragraphs,
    selectedParagraphs,
    current.paragraphs,
    choices,
  );
  if (
    merged.unresolved.some((x) => resolution?.choices[x.id] && !choices[x.id])
  )
    throw Error(
      "The conflicting passage changed again. Review the latest edits before accepting.",
    );
  if (merged.unresolved.length)
    throw Error(
      "These paragraphs changed in both versions: " +
        merged.unresolved.map((x) => x.label).join(", ") +
        ". Choose which version to keep in comparison.",
    );
  const accepted = labelProposalParagraphs(
    s,
    chapter,
    current,
    merged.paragraphs,
  );
  const next = commit(
    s,
    saved.chapterId,
    current.id,
    accepted,
    saved.title +
      (JSON.stringify(paragraphs) !== JSON.stringify(saved.paragraphs)
        ? " · edited by author before acceptance"
        : "") +
      (current.id !== original.id ? " · merged with current draft" : ""),
    "proposal",
  );
  return {
    ...next,
    proposals: next.proposals.map((x) =>
      x.id === saved.id
        ? {
            ...x,
            status: declinedIds.length
              ? ("partially-accepted" as const)
              : ("accepted" as const),
            review: {
              reviewedRevisionId: current.id,
              resultRevisionId: next.chapters.find(
                (c) => c.id === saved.chapterId,
              )!.headId,
              createdAt: now(),
              choices: Object.entries(choices).map(([id, choice]) => ({
                id,
                choice,
              })),
              selectedChangeIds: selectedIds,
              declinedChangeIds: declinedIds,
              paragraphs,
            },
          }
        : x,
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

export function rejectProposal(s: State, id: string): State {
  const saved = s.proposals.find((p) => p.id === id);
  if (!saved || saved.status !== "pending")
    throw Error("Proposal already reviewed or missing.");
  return {
    ...s,
    proposals: s.proposals.map((p) =>
      p.id === id ? { ...p, status: "rejected" as const } : p,
    ),
  };
}
