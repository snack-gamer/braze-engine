import { useCallback, useState } from "react";

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

export function usePersistedJson<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as unknown;
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  });
  const setPersisted = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const resolved = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Preferences remain usable in memory.
      }
      return resolved;
    });
  }, [key]);
  return [value, setPersisted];
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
