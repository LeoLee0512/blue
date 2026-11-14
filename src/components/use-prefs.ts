import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_PREFS, parsePrefs, prefsToRoot, PREFS_KEY, type Prefs } from "@/lib/write/prefs";

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (current) return current;
  try {
    current = parsePrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    current = DEFAULT_PREFS;
  }
  return current;
}

function systemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  const out = prefsToRoot(prefs, systemDark());
  root.classList.toggle("dark", out.dark);
  root.style.colorScheme = out.dark ? "dark" : "light";
  root.dataset.palette = out.palette;
  for (const [key, value] of Object.entries(out.vars)) root.style.setProperty(key, value);
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = parsePrefs({ ...read(), ...patch });
  current = next;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // 存不下也照样生效到本次会话
  }
  applyPrefs(next);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS);
  useEffect(() => {
    applyPrefs(prefs);
    if (prefs.mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefs(read());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs]);
  return prefs;
}
