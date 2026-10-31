import { pageFormats, type PageFormat, type PageMargins } from "./pageGeometry";
export const fullscreenZoomOptions = {
  page: "Fit page",
  width: "Fit width",
  "75": "75%",
  "100": "100%",
  "125": "125%",
  "150": "150%",
};
export type FullscreenZoom = keyof typeof fullscreenZoomOptions;
export const minTextSize = 8;
export const maxTextSize = 16;
export type Preferences = {
  mode: "continuous" | "pages" | "spread";
  fullscreenZoom: FullscreenZoom;
  size: number;
  format: PageFormat;
  margins: PageMargins;
  leading: number;
  flip: boolean;
  paper: "ivory" | "white" | "sepia";
  texture: "smooth" | "grain" | "linen";
  selectable: boolean;
  showIds: boolean;
  drag: boolean;
  progress: boolean;
};
const authorDefaults: Preferences = {
  mode: "pages",
  fullscreenZoom: "page",
  size: 14,
  format: "a5",
  margins: "normal",
  leading: 1.9,
  flip: true,
  paper: "ivory",
  texture: "smooth",
  selectable: true,
  showIds: false,
  drag: false,
  progress: false,
};
export function readPreferences(
  key = "khosra-reader",
  overrides: Partial<Preferences> = {},
): Preferences {
  const defaults = { ...authorDefaults, ...overrides };
  try {
    const p = JSON.parse(localStorage.getItem(key) || "null");
    return {
      mode: ["continuous", "pages", "spread"].includes(p?.mode)
        ? p.mode
        : defaults.mode,
      fullscreenZoom:
        typeof p?.fullscreenZoom === "string" &&
        Object.hasOwn(fullscreenZoomOptions, p.fullscreenZoom)
          ? p.fullscreenZoom
          : defaults.fullscreenZoom,
      size:
        Number.isInteger(p?.size) && p.size >= minTextSize && p.size <= 32
          ? Math.min(maxTextSize, p.size)
          : defaults.size,
      format: Object.hasOwn(pageFormats, p?.format)
        ? p.format
        : defaults.format,
      margins: ["tight", "normal", "relaxed"].includes(p?.margins)
        ? p.margins
        : defaults.margins,
      leading: [1.6, 1.9, 2.2].includes(p?.leading)
        ? p.leading
        : defaults.leading,
      paper: ["ivory", "white", "sepia"].includes(p?.paper)
        ? p.paper
        : defaults.paper,
      texture: ["smooth", "grain", "linen"].includes(p?.texture)
        ? p.texture
        : defaults.texture,
      flip: typeof p?.flip === "boolean" ? p.flip : defaults.flip,
      selectable:
        typeof p?.selectable === "boolean" ? p.selectable : defaults.selectable,
      showIds: typeof p?.showIds === "boolean" ? p.showIds : defaults.showIds,
      drag: typeof p?.drag === "boolean" ? p.drag : defaults.drag,
      progress:
        typeof p?.progress === "boolean" ? p.progress : defaults.progress,
    };
  } catch {
    return defaults;
  }
}

export function readGuestPreferences(viewportWidth: number): Preferences {
  return readPreferences("khosra-guest-reader", {
    mode: viewportWidth >= 760 ? "spread" : "continuous",
    paper: "sepia",
    texture: "grain",
    size: 12,
    selectable: false,
    drag: true,
  });
}
