import { describe, expect, it } from "vitest";
import { manuscriptMarkdown } from "../src/storage/markdown";

describe("manuscript Markdown export", () => {
  it("preserves Bengali dialogue lines and separate paragraph blocks", () => {
    expect(
      manuscriptMarkdown([
        {
          title: "পরিচয়",
          paragraphs: [
            { section: "", text: "—তুমি কোথায়?\n—এই তো।\n—চলো।" },
            { section: "", text: "তারপর তারা হাঁটল।" },
          ],
        },
      ]),
    ).toBe(
      "# পরিচয়\n\n—তুমি কোথায়?  \n—এই তো।  \n—চলো।\n\nতারপর তারা হাঁটল।",
    );
  });

  it("normalizes Windows breaks without flattening blank lines or changing source", () => {
    const chapters = [
      {
        title: "First",
        paragraphs: [
          { section: "Scene", text: "One\r\nTwo\r\n\r\nThree\rFour" },
          { section: "", text: "  বাংলা কথা।  \n\n\nশেষ।" },
        ],
      },
      { title: "Next", paragraphs: [{ section: "", text: "Last" }] },
    ];
    const original = structuredClone(chapters);
    expect(manuscriptMarkdown(chapters)).toBe(
      "# First\n\n## Scene\n\nOne  \nTwo\n\nThree  \nFour\n\n  বাংলা কথা।  \n\n\nশেষ।\n\n# Next\n\nLast",
    );
    expect(chapters).toEqual(original);
  });

  it("keeps blank and whitespace-only lines and handles an empty manuscript", () => {
    expect(manuscriptMarkdown([])).toBe("");
    expect(
      manuscriptMarkdown([
        {
          title: "Empty",
          paragraphs: [
            { section: "", text: "" },
            { section: "", text: "A\n \nB\n" },
          ],
        },
      ]),
    ).toBe("# Empty\n\n\n\nA\n \nB\n");
  });
});
