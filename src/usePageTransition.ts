import { useLayoutEffect, useRef } from "react";

// Animate existing view content: no delayed navigation or keyed remounts that
// could discard an editor's selection, focus or unsaved component state.
export function usePageTransition(route: string, enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(route);
  useLayoutEffect(() => {
    const changed = previous.current !== route;
    previous.current = route;
    if (!changed || !enabled || !root.current) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const targets = root.current.querySelectorAll<HTMLElement>(
      ":scope > main, :scope > .writing-layout, :scope > .chapter-banner, :scope > .history-banner",
    );
    const animations = [...targets].flatMap((element) =>
      typeof element.animate === "function"
        ? [
            element.animate([{ opacity: 0.65 }, { opacity: 1 }], {
              id: "khosra-page-transition",
              duration: 150,
              easing: "ease-out",
            }),
          ]
        : [],
    );
    const stop = () => animations.forEach((animation) => animation.cancel());
    motion.addEventListener("change", stop);
    return () => {
      stop();
      motion.removeEventListener("change", stop);
    };
  }, [route, enabled]);
  return root;
}
