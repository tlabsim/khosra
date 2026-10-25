import { useSyncExternalStore } from "react";
const key = "khosra-appearance-v1";
const changed = "khosra-appearance-changed";
function savedHighContrast() {
  try {
    return localStorage.getItem(key) === "high";
  } catch {
    return false;
  }
}
function apply(high: boolean) {
  document.documentElement.dataset.contrast = high ? "high" : "normal";
  window.dispatchEvent(new Event(changed));
}
export function initializeAppearance() {
  apply(savedHighContrast());
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(savedHighContrast());
  });
}
function setHighContrast(high: boolean) {
  try {
    localStorage.setItem(key, high ? "high" : "normal");
  } catch {
    /* Keep the current session usable when storage is unavailable. */
  }
  apply(high);
}
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  return () => window.removeEventListener(changed, listener);
}
const snapshot = () => document.documentElement.dataset.contrast === "high";
export function useHighContrast() {
  return [useSyncExternalStore(subscribe, snapshot), setHighContrast] as const;
}
