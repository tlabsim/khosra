/** Shared ownership lets nested dialogs close in either order without leaving a lock. */
const locks = new WeakMap<
  HTMLElement,
  { count: number; value: string; priority: string }
>();

export function lockScroll(
  element: HTMLElement = document.documentElement,
): () => void {
  let lock = locks.get(element);
  if (!lock) {
    lock = {
      count: 0,
      value: element.style.getPropertyValue("overflow"),
      priority: element.style.getPropertyPriority("overflow"),
    };
    locks.set(element, lock);
    element.style.setProperty("overflow", "hidden");
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count > 0) return;
    if (lock.value)
      element.style.setProperty("overflow", lock.value, lock.priority);
    else element.style.removeProperty("overflow");
    locks.delete(element);
  };
}
