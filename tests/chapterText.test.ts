import { describe, expect, it } from "vitest";
import {
  editBreakRanges,
  paragraphDraft,
  parseChapterDraft,
  plainTextParagraphs,
  replaceBreakRanges,
} from "../src/import/chapterText";

describe("chapter paragraph boundaries", () => {
  it("recognizes Word-style single CRLF paragraph breaks", () => {
    expect(
      plainTextParagraphs(
        "অধ্যায় ১\r\nনতুন দুই মুখ\r\nপ্রথম অনুচ্ছেদ।\r\nদ্বিতীয় অনুচ্ছেদ।",
      ),
    ).toEqual([
      "অধ্যায় ১",
      "নতুন দুই মুখ",
      "প্রথম অনুচ্ছেদ।",
      "দ্বিতীয় অনুচ্ছেদ।",
    ]);
  });
  it("keeps wrapped lines together when blank-line boundaries are present", () => {
    expect(
      plainTextParagraphs("First line\r\ncontinued\r\n \t\r\nSecond paragraph"),
    ).toEqual(["First line\ncontinued", "Second paragraph"]);
  });
  it("allows explicit line and blank-line interpretation", () => {
    expect(plainTextParagraphs("First\ncontinued\n\nSecond", "line")).toEqual([
      "First",
      "continued",
      "Second",
    ]);
    expect(plainTextParagraphs("First\ncontinued", "blank")).toEqual([
      "First\ncontinued",
    ]);
  });
  it("keeps manual Word/Unicode line breaks within their paragraph", () => {
    expect(plainTextParagraphs("First\u000bsoft\r\nSecond\u2028soft")).toEqual([
      "First\nsoft",
      "Second\nsoft",
    ]);
    expect(plainTextParagraphs("First\u2029Second")).toEqual([
      "First",
      "Second",
    ]);
  });
  it("preserves hard line breaks, even beside a paragraph separator", () => {
    const original = ["A\n", "\nB\n\nC", "D\n\n"];
    const draft = paragraphDraft(original);
    expect(
      parseChapterDraft(draft.text, "auto", draft.protectedBreaks),
    ).toEqual(original);
  });
  it("preserves imported line breaks after ordinary author edits", () => {
    const draft = paragraphDraft(["কথা\n\nআরও কথা।", "শেষ।"]);
    const edited = "নতুন " + draft.text;
    const ranges = editBreakRanges(draft.text, edited, draft.protectedBreaks);
    expect(parseChapterDraft(edited, "auto", ranges)).toEqual([
      "নতুন কথা\n\nআরও কথা।",
      "শেষ।",
    ]);
  });
  it("allows an author to turn an imported line break into a paragraph break", () => {
    const draft = paragraphDraft(["A\nB"]);
    const edited = "A\n\nB";
    expect(
      parseChapterDraft(
        edited,
        "auto",
        editBreakRanges(draft.text, edited, draft.protectedBreaks),
      ),
    ).toEqual(["A", "B"]);
  });
  it("keeps later manual breaks anchored when earlier text is replaced", () => {
    const draft = paragraphDraft(["First", "Next\n\nline"]);
    const edited = "Changed" + draft.text.slice(5);
    expect(
      parseChapterDraft(
        edited,
        "auto",
        replaceBreakRanges(draft.protectedBreaks, 0, 5, 7),
      ),
    ).toEqual(["Changed", "Next\n\nline"]);
  });
  it("does not rewrite Bengali, spaces, punctuation, or nonbreaking spaces", () => {
    const text = "  বাংলা\u200c কথা ‘একটি’ — দুই।  ";
    expect(plainTextParagraphs(text)).toEqual([text]);
    expect(parseChapterDraft(paragraphDraft([text]).text, "auto", [])).toEqual([
      text,
    ]);
  });
  it("ignores empty transport paragraphs without losing their neighbors", () => {
    expect(plainTextParagraphs("\r\n\r\nFirst\r\n\r\n\r\nSecond\r\n")).toEqual([
      "First",
      "Second\n",
    ]);
    expect(plainTextParagraphs(" \r\n\t\r\n")).toEqual([]);
  });
  it("round-trips varied paragraph and manual-break combinations", () => {
    let seed = 7183;
    const pieces = ["বাংলা", "word", "🙂", "\n", "\n\n", " ", "\t"];
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let sample = 0; sample < 300; sample++) {
      const original = Array.from(
        { length: 2 + (random() % 5) },
        () =>
          Array.from(
            { length: random() % 12 },
            () => pieces[random() % pieces.length],
          ).join("") + "শেষ",
      );
      const draft = paragraphDraft(original);
      expect(
        parseChapterDraft(draft.text, "auto", draft.protectedBreaks),
      ).toEqual(original);
    }
  });
});
