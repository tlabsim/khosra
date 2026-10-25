import { expect, it } from "vitest";
import {
  editionReferences,
  removedPassages,
  restoreParagraph,
} from "../src/domain/paragraphRecovery";
import type { Revision } from "../src/domain/model";
const ps = [
  { id: "a", label: 1, text: "আগে", section: "" },
  { id: "b", label: 2, text: "—কথা।", section: "Scene" },
  { id: "c", label: 3, text: "পরে", section: "" },
];
it("finds removals and cleared prose by identity rather than labels", () => {
  const parent = { paragraphs: ps } as Revision;
  const r = {
    paragraphs: [
      { ...ps[0], text: "" },
      { ...ps[2], text: "নতুন" },
    ],
  } as Revision;
  expect(removedPassages(r, parent)).toEqual([
    { paragraph: ps[0], kind: "cleared" },
    { paragraph: ps[1], kind: "deleted" },
  ]);
  expect(removedPassages(r)).toEqual([]);
});
it("restores the original identity, heading and location without changing current prose", () => {
  const current = [{ ...ps[0], text: "edited" }, ps[2]],
    before = structuredClone(current);
  expect(restoreParagraph(current, ps, "b", 4)).toEqual([
    current[0],
    ps[1],
    ps[2],
  ]);
  expect(current).toEqual(before);
});
it("uses the preceding surviving neighbor or appends when neither survives", () => {
  expect(restoreParagraph([ps[0]], ps, "b", 4)).toEqual(ps.slice(0, 2));
  expect(restoreParagraph([], ps, "b", 4)).toEqual([ps[1]]);
});
it("restores cleared text and refuses to overwrite existing prose", () => {
  expect(restoreParagraph([{ ...ps[1], text: "" }], ps, "b", 4)).toEqual([
    ps[1],
  ]);
  expect(() => restoreParagraph(ps, ps, "b", 4)).toThrow("already has text");
});
it("allocates an unused label when renumbering has reused the historical label", () => {
  expect(restoreParagraph([{ ...ps[0], label: 2 }], ps, "b", 9)[1]).toEqual({
    ...ps[1],
    label: 9,
  });
});
it("ignores deleted blank blocks but retains deleted subsection headings", () => {
  expect(
    removedPassages(
      { paragraphs: [] } as unknown as Revision,
      { paragraphs: [{ ...ps[0], text: " " }] } as Revision,
    ),
  ).toEqual([]);
  expect(
    removedPassages(
      { paragraphs: [] } as unknown as Revision,
      { paragraphs: [{ ...ps[1], text: "" }] } as Revision,
    ),
  ).toHaveLength(1);
});
it("respects current-edition identities and labels reserved by earlier deleted blocks", () => {
  const renamed = { ...ps[1], label: 8 };
  expect(restoreParagraph([], ps, "b", 9, [renamed])[0].label).toBe(8);
  expect(
    restoreParagraph([], ps, "b", 9, [{ ...ps[0], label: 2 }])[0].label,
  ).toBe(9);
});

it("reads reference reservations only along the current edition ancestry", () => {
  const older = {
    id: "old",
    parentId: null,
    edition: 1,
    paragraphs: ps,
  } as Revision;
  const renumbered = {
    ...older,
    id: "renumbered",
    parentId: "old",
    edition: 2,
    paragraphs: [{ ...ps[1], label: 1 }],
  };
  const current = {
    ...renumbered,
    id: "current",
    parentId: "renumbered",
    paragraphs: [],
  };
  const unrelated = { ...renumbered, id: "branch", paragraphs: [ps[2]] };
  const refs = editionReferences(
    [older, renumbered, current, unrelated],
    current,
  );
  expect(refs).toEqual(renumbered.paragraphs);
  expect(restoreParagraph([], ps, "b", 2, refs)[0]).toMatchObject({
    id: "b",
    label: 1,
  });
});
