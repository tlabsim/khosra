export const pageFormats = {
  paperback: { label: "Paperback · 6 × 9", width: 6, height: 9, ratio: 6 / 9 },
  digest: {
    label: "Digest · 5½ × 8½",
    width: 5.5,
    height: 8.5,
    ratio: 5.5 / 8.5,
  },
  a5: { label: "A5", width: 148 / 25.4, height: 210 / 25.4, ratio: 148 / 210 },
};
export type PageFormat = keyof typeof pageFormats;
export type PageMargins = "tight" | "normal" | "relaxed";
export const marginFactors = { tight: 0.055, normal: 0.08, relaxed: 0.11 };
/** Fixed 96 CSS pixels/inch canvas. Display zoom never changes typesetting. */
export function pageGeometry(
  availableWidth: number,
  spread: number,
  format: PageFormat,
  margins: PageMargins,
  maxScale = 1.15,
) {
  const paper = pageFormats[format];
  const pageWidth = paper.width * 96;
  const width = pageWidth * spread,
    height = paper.height * 96;
  const insetX = pageWidth * marginFactors[margins];
  const insetY = height * marginFactors[margins];
  const scale = Math.max(0.001, Math.min(maxScale, availableWidth / width));
  return {
    width,
    height,
    insetX,
    insetY,
    scale,
    displayWidth: width * scale,
    displayHeight: height * scale,
    gap: insetX * 2,
    column: pageWidth - insetX * 2,
    textHeight: height - insetY * 2,
  };
}
