import { useEffect, useRef, useState, type PointerEvent } from "react";

export function useMousePageTurn(
  enabled: boolean,
  turn: (direction: number) => void,
) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const cancel = () => {
    start.current = null;
    setDragging(false);
  };
  useEffect(() => {
    const blur = () => {
      start.current = null;
      setDragging(false);
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  useEffect(() => {
    start.current = null;
    setDragging(false);
  }, [enabled]);
  return {
    dragging,
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      e.currentTarget.focus({ preventScroll: true });
      if (
        !enabled ||
        e.pointerType !== "mouse" ||
        e.button !== 0 ||
        !e.isPrimary ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest("a,button,input,textarea,select"))
      )
        return;
      e.preventDefault(); // Normal drags turn pages; Shift preserves native text selection.
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      const origin = start.current;
      if (!origin || origin.id !== e.pointerId) return;
      cancel();
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (!enabled) return;
      const dx = e.clientX - origin.x,
        dy = e.clientY - origin.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.8)
        turn(dx < 0 ? 1 : -1);
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  };
}
