import { useCallback, useEffect, useRef, useState } from "react";

export function usePersistedString<T extends string>(
  key: string,
  fallback: T,
  valid: (value: string) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw && valid(raw) ? raw : fallback;
  });
  const setPersisted = useCallback((next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Preferences remain usable in memory.
    }
  }, [key]);
  return [value, setPersisted];
}

export function usePersistedNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (next: number) => void] {
  const [value, setValue] = useState<number>(() => {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  });
  const setPersisted = useCallback((next: number) => {
    const resolved = Math.min(max, Math.max(min, next));
    setValue(resolved);
    try {
      window.localStorage.setItem(key, String(resolved));
    } catch {
      // Preferences remain usable in memory.
    }
  }, [key, max, min]);
  return [value, setPersisted];
}

function readJson<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return valid(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

/** Mounted Project and picker consumers observe the same preference changes. */
export function usePersistedJson<T>(key: string, fallback: T, valid: (value: unknown) => value is T):
  [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readJson(key, fallback, valid));
  const current = useRef(value); current.current = value;
  useEffect(() => {
    const receive = (event: Event) => {
      const change = (event as CustomEvent<{ key: string; value: unknown }>).detail;
      if (event.type === "storage" ? (event as StorageEvent).key !== key : change?.key !== key) return;
      const next = change && valid(change.value) ? change.value : readJson(key, current.current, valid);
      current.current = next; setValue(next);
    };
    window.addEventListener("braze:asset-preference", receive);
    window.addEventListener("storage", receive);
    return () => { window.removeEventListener("braze:asset-preference", receive); window.removeEventListener("storage", receive); };
  }, [key, valid]);
  const setPersisted = useCallback((next: T | ((previous: T) => T)) => {
    const previous = readJson(key, current.current, valid);
    const resolved = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    current.current = resolved; setValue(resolved);
    try { window.localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* Retain in-memory preferences. */ }
    window.dispatchEvent(new CustomEvent("braze:asset-preference", { detail: { key, value: resolved } }));
  }, [key, valid]);
  return [value, setPersisted];
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
