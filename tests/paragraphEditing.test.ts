import { expect, it } from "vitest";
import {
  splitParagraph,
  joinParagraph,
  deleteParagraph,
} from "../src/domain/paragraphEditing";
const ps = [
  { id: "a", label: 1, text: "শুরু শেষ", section: "Opening" },
  { id: "b", label: 7, text: "—কথা।", section: "" },
];
it("splits at the caret without changing other IDs, labels or heading", () => {
  const before = structuredClone(ps),
    r = splitParagraph(ps, "a", ps[0].text, 5, 5, 8);
  expect(r.paragraphs.map((p) => p.text)).toEqual([
    ps[0].text.slice(0, 5),
    ps[0].text.slice(5),
    ps[1].text,
  ]);
  expect(r.paragraphs[0]).toMatchObject({
    id: "a",
    label: 1,
    section: "Opening",
  });
  expect(r.paragraphs[1]).toMatchObject({ label: 8, section: "" });
  expect(r.activeId).toBe(r.paragraphs[1].id);
  expect(r.caret).toBe(0);
  expect(r.paragraphs[2]).toEqual(ps[1]);
  expect(ps).toEqual(before);
});
it("keeps the prose address when inserting an empty paragraph before it", () => {
  const r = splitParagraph(ps, "b", ps[1].text, 0, 0, 8);
  expect(r.paragraphs[1]).toMatchObject({ label: 8, text: "" });
  expect(r.paragraphs[2]).toEqual(ps[1]);
  expect(r.activeId).toBe("b");
});
it("splits a selected range and preserves manual newlines exactly", () => {
  const r = splitParagraph(ps, "b", "one\nline REMOVE শেষ", 9, 16, 8);
  expect(r.paragraphs[1].text).toBe("one\nline ");
  expect(r.paragraphs[2].text).toBe("শেষ");
});
it("joins without invented whitespace, retaining the first identity and caret boundary", () => {
  const r = joinParagraph(ps, "b", "—নতুন।", -1)!;
  expect(r.paragraphs).toEqual([{ ...ps[0], text: ps[0].text + "—নতুন।" }]);
  expect(r.activeId).toBe("a");
  expect(r.caret).toBe(ps[0].text.length);
  const f = joinParagraph(ps, "a", "Updated", 1)!;
  expect(f.paragraphs[0]).toMatchObject({
    id: "a",
    label: 1,
    text: "Updated" + ps[1].text,
  });
  expect(joinParagraph(ps, "a", "Updated", -1)).toBeNull();
});
it("does not silently remove subsection headings on join", () => {
  expect(() =>
    joinParagraph(
      [
        { ...ps[0], section: "" },
        { ...ps[1], section: "Later" },
      ],
      "b",
      ps[1].text,
      -1,
    ),
  ).toThrow("subsection heading");
});
it("deletes with deterministic next/previous focus, including the final paragraph", () => {
  const before = structuredClone(ps);
  expect(deleteParagraph(ps, "a")).toEqual({
    paragraphs: [ps[1]],
    activeId: "b",
    caret: 0,
  });
  expect(deleteParagraph(ps, "b")).toEqual({
    paragraphs: [ps[0]],
    activeId: "a",
    caret: ps[0].text.length,
  });
  expect(deleteParagraph([ps[0]], "a")).toEqual({
    paragraphs: [],
    activeId: null,
    caret: 0,
  });
  expect(ps).toEqual(before);
});
