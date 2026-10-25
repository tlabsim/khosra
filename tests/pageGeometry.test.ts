import { expect, it } from "vitest";
import {
  pageFormats,
  pageGeometry,
  type PageFormat,
  type PageMargins,
} from "../src/reader/pageGeometry";
it("keeps physical trim and typesetting fixed through display zoom and spreads", () => {
  for (const format of Object.keys(pageFormats) as PageFormat[])
    for (const margins of ["tight", "normal", "relaxed"] as PageMargins[]) {
      const normal = pageGeometry(1100, 2, format, margins);
      for (const width of [296, 784, 1600])
        for (const spread of [1, 2]) {
          const g = pageGeometry(width, spread, format, margins, 1.4);
          expect(g.width / spread / g.height).toBeCloseTo(
            pageFormats[format].ratio,
            8,
          );
          expect(g.displayWidth).toBeLessThanOrEqual(width + 0.001);
          expect(g.column).toBe(normal.column);
          expect(g.textHeight).toBe(normal.textHeight);
          expect(
            g.column * spread + g.gap * (spread - 1) + g.insetX * 2,
          ).toBeCloseTo(g.width, 8);
          expect(g.textHeight + 2 * g.insetY).toBeCloseTo(g.height, 8);
        }
    }
});
it("uses actual inch dimensions and lets normal reading use available width", () => {
  const g = pageGeometry(1200, 2, "paperback", "normal");
  expect(g.width).toBe(6 * 96 * 2);
  expect(g.height).toBe(9 * 96);
  expect(g.displayWidth).toBeCloseTo(1200);
});
it("margins affect text area but not trim or display size", () => {
  const sizes = (["tight", "normal", "relaxed"] as const).map((m) =>
    pageGeometry(1100, 2, "paperback", m),
  );
  expect(
    new Set(sizes.map((g) => `${g.width}:${g.height}:${g.scale}`)).size,
  ).toBe(1);
  expect(sizes[0].column).toBeGreaterThan(sizes[1].column);
  expect(sizes[1].textHeight).toBeGreaterThan(sizes[2].textHeight);
});
