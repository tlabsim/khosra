import { afterEach, expect, it, vi } from "vitest";
import {
  readGuestPreferences,
  readPreferences,
} from "../src/reader/preferences";
function stored(value: unknown) {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(value) });
  return readPreferences();
}
afterEach(() => vi.unstubAllGlobals());
it("uses 14pt defaults and retains every supported 8–16pt size", () => {
  expect(stored(null).size).toBe(14);
  for (let size = 8; size <= 16; size++)
    expect(stored({ size }).size).toBe(size);
  for (const size of [7, 33, 12.5, "14", null])
    expect(stored({ size }).size).toBe(14);
});
it("clamps previously supported larger text sizes to 16pt", () => {
  for (let size = 17; size <= 32; size++)
    expect(stored({ size }).size).toBe(16);
});
it("ignores legacy line counts and validates paper format and margins", () => {
  expect(stored({ lines: 14, size: 14 })).toMatchObject({
    size: 14,
    format: "a5",
    margins: "normal",
  });
  expect(stored({ format: "digest", margins: "relaxed" })).toMatchObject({
    format: "digest",
    margins: "relaxed",
  });
  expect(stored({ format: "__proto__", margins: "invalid" })).toMatchObject({
    format: "a5",
    margins: "normal",
  });
});

it("defaults author and guest paper to A5 while retaining explicit format choices", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  expect(readPreferences().format).toBe("a5");
  expect(readGuestPreferences(390).format).toBe("a5");
  expect(readGuestPreferences(1440).format).toBe("a5");
  for (const format of ["paperback", "digest", "a5"]) {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ format }),
    });
    expect(readPreferences().format).toBe(format);
    expect(readGuestPreferences(1440).format).toBe(format);
  }
});

it("remembers independent fullscreen zoom and defaults to fitting the full page", () => {
  expect(stored(null).fullscreenZoom).toBe("page");
  for (const fullscreenZoom of ["page", "width", "75", "100", "125", "150"])
    expect(stored({ fullscreenZoom }).fullscreenZoom).toBe(fullscreenZoom);
  expect(stored({ fullscreenZoom: "bad" }).fullscreenZoom).toBe("page");
});

it("uses responsive guest defaults without changing author preferences", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  for (const width of [360, 759, 760, 1440]) {
    expect(readGuestPreferences(width)).toMatchObject({
      mode: width >= 760 ? "spread" : "continuous",
      paper: "sepia",
      texture: "grain",
      size: 12,
      leading: 1.6,
      selectable: false,
      drag: true,
    });
  }
  expect(readPreferences()).toMatchObject({
    mode: "pages",
    paper: "ivory",
    texture: "smooth",
    size: 14,
    leading: 1.9,
    selectable: true,
    drag: false,
  });
});

it("retains saved guest choices and fills missing or invalid fields with guest defaults", () => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "khosra-guest-reader"
        ? JSON.stringify({
            mode: "pages",
            paper: "white",
            texture: "linen",
            size: 16,
            leading: 2.2,
            selectable: true,
            drag: false,
          })
        : null,
  });
  expect(readGuestPreferences(390)).toMatchObject({
    mode: "pages",
    paper: "white",
    texture: "linen",
    size: 16,
    leading: 2.2,
    selectable: true,
    drag: false,
  });
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ paper: "white", size: 99, leading: 99 }),
  });
  expect(readGuestPreferences(1440)).toMatchObject({
    mode: "spread",
    paper: "white",
    texture: "grain",
    size: 12,
    leading: 1.6,
  });
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
  });
  expect(readGuestPreferences(390)).toMatchObject({
    mode: "continuous",
    paper: "sepia",
    texture: "grain",
    size: 12,
    leading: 1.6,
  });
});
