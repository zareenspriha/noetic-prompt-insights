"use client";

import { useSyncExternalStore } from "react";

/** Demo mode = serve seeded JSON from /mocks instead of calling the FastAPI backend.
 *  ON by default so the app always works, even with no backend running.
 *  Remembered per browser in localStorage (falls back to memory if storage is blocked). */
const KEY = "pi-demo-mode";
const listeners = new Set<() => void>();
let memory = true;

function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? memory : v === "1";
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function setDemo(v: boolean) {
  memory = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

export function useDemoMode() {
  const demo = useSyncExternalStore(subscribe, read, () => true);
  return { demo, setDemo };
}
