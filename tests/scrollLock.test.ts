import { expect, it } from "vitest";
import { lockScroll } from "../src/scrollLock";
function element(initial = "", priority = "") {
  let value = initial,
    importance = priority;
  return {
    style: {
      getPropertyValue: () => value,
      getPropertyPriority: () => importance,
      setProperty: (_: string, next: string, nextPriority = "") => {
        value = next;
        importance = nextPriority;
      },
      removeProperty: () => {
        value = "";
        importance = "";
      },
    },
  } as unknown as HTMLElement;
}
for (const parentFirst of [true, false])
  it(`retains nested locks until the last owner closes (${parentFirst ? "parent" : "child"} first)`, () => {
    const el = element();
    const parent = lockScroll(el),
      child = lockScroll(el);
    (parentFirst ? parent : child)();
    expect(el.style.getPropertyValue("overflow")).toBe("hidden");
    (parentFirst ? child : parent)();
    expect(el.style.getPropertyValue("overflow")).toBe("");
  });
it("preserves an original overflow value and its importance", () => {
  const el = element("clip", "important");
  const release = lockScroll(el);
  expect(el.style.getPropertyValue("overflow")).toBe("hidden");
  release();
  expect(el.style.getPropertyValue("overflow")).toBe("clip");
  expect(el.style.getPropertyPriority("overflow")).toBe("important");
});
it("releases each owner once and supports reacquisition during cleanup", () => {
  const el = element("auto");
  const first = lockScroll(el),
    second = lockScroll(el);
  first();
  first();
  const third = lockScroll(el);
  second();
  expect(el.style.getPropertyValue("overflow")).toBe("hidden");
  third();
  expect(el.style.getPropertyValue("overflow")).toBe("auto");
  const again = lockScroll(el);
  again();
  expect(el.style.getPropertyValue("overflow")).toBe("auto");
});
it("keeps root and fullscreen body ownership independent", () => {
  const root = element(),
    body = element();
  const outer = lockScroll(body),
    inner = lockScroll(root);
  outer();
  expect(body.style.getPropertyValue("overflow")).toBe("");
  expect(root.style.getPropertyValue("overflow")).toBe("hidden");
  inner();
  expect(root.style.getPropertyValue("overflow")).toBe("");
});
