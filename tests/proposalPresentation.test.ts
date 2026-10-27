import { expect, it } from "vitest";
import {
  acceptedProposalParagraphs,
  newestProposals,
} from "../src/domain/proposalPresentation";
import type { Proposal, Revision } from "../src/domain/model";
const p = { id: "p", label: 1, text: "Original", section: "" };
const q = { ...p, id: "q", label: 2 };
const r = { ...p, id: "r", label: 3 };
const root = {
  id: "root",
  chapterId: "chapter",
  parentId: null,
  paragraphs: [p, q],
  source: "author",
  edition: 1,
} as Revision;
const accepted = {
  ...root,
  id: "accepted",
  parentId: root.id,
  source: "proposal",
  paragraphs: [{ ...p, text: "Rewritten" }, q, r],
} as Revision;
it("sorts newest first before pagination, breaks equal dates by latest position and leaves source intact", () => {
  const list = [
    { id: "new", createdAt: "2026-10-28T00:00:00Z" },
    { id: "old", createdAt: "2026-10-26T00:00:00Z" },
    { id: "tie", createdAt: "2026-10-28T00:00:00Z" },
  ] as Proposal[];
  expect(newestProposals(list).map((p) => p.id)).toEqual(["tie", "new", "old"]);
  expect(list.map((p) => p.id)).toEqual(["new", "old", "tie"]);
});
it("marks only paragraphs changed or inserted through acceptance, never unchanged proposal context", () => {
  expect([...acceptedProposalParagraphs([root, accepted], accepted)]).toEqual([
    "p",
    "r",
  ]);
  expect([...acceptedProposalParagraphs([root, accepted], root)]).toEqual([]);
});
it("preserves marks through unrelated edits, ordering and renumbering but clears an author-edited paragraph", () => {
  const author = {
    ...accepted,
    id: "author",
    parentId: accepted.id,
    source: "author",
    paragraphs: [
      { ...r, label: 1 },
      { ...accepted.paragraphs[0], label: 2 },
      { ...q, label: 3, text: "Author edit" },
    ],
  } as Revision;
  const history = [root, accepted, author];
  expect([...acceptedProposalParagraphs(history, author)].sort()).toEqual([
    "p",
    "r",
  ]);
  const edited = {
    ...author,
    id: "edited",
    parentId: author.id,
    paragraphs: author.paragraphs.map((p) =>
      p.id === "p" ? { ...p, text: "Author rewrite" } : p,
    ),
  };
  expect([...acceptedProposalParagraphs([...history, edited], edited)]).toEqual(
    ["r"],
  );
});
it("counts section edits, ignores rejected branches, and does not use timestamps or array order for ancestry", () => {
  const section = {
    ...root,
    id: "section",
    parentId: root.id,
    source: "proposal",
    paragraphs: [{ ...p, section: "Scene" }, q],
  } as Revision;
  const branch = {
    ...root,
    id: "branch",
    parentId: root.id,
    source: "proposal",
    paragraphs: [p, { ...q, text: "Unused branch" }],
  } as Revision;
  expect([
    ...acceptedProposalParagraphs([branch, section, root], section),
  ]).toEqual(["p"]);
});
it("clears deleted/restored text rather than attributing a manual restoration to an earlier proposal", () => {
  const deleted = {
    ...accepted,
    id: "deleted",
    parentId: accepted.id,
    source: "author",
    paragraphs: [q, r],
  } as Revision;
  const restored = {
    ...accepted,
    id: "restored",
    parentId: deleted.id,
    source: "restore",
  } as Revision;
  expect([
    ...acceptedProposalParagraphs(
      [root, accepted, deleted, restored],
      restored,
    ),
  ]).toEqual(["r"]);
});
