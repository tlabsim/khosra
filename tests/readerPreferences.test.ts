import { afterEach, expect, it, vi } from "vitest";
import { readPreferences } from "../src/reader/preferences";
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
    format: "paperback",
    margins: "normal",
  });
  expect(stored({ format: "digest", margins: "relaxed" })).toMatchObject({
    format: "digest",
    margins: "relaxed",
  });
  expect(stored({ format: "__proto__", margins: "invalid" })).toMatchObject({
    format: "paperback",
    margins: "normal",
  });
});

it("remembers independent fullscreen zoom and defaults to fitting the full page", () => {
  expect(stored(null).fullscreenZoom).toBe("page");
  for (const fullscreenZoom of ["page", "width", "75", "100", "125", "150"])
    expect(stored({ fullscreenZoom }).fullscreenZoom).toBe(fullscreenZoom);
  expect(stored({ fullscreenZoom: "bad" }).fullscreenZoom).toBe("page");
});
