import {
  DEFAULT_DOCK_DOCUMENT,
  dockDocumentFromLegacySizes,
  parseDockDocument,
  type DockLayoutDocument,
} from "./layout";

export const DOCK_STORAGE_KEY = "braze.editor.dock-layout.v3";
export const PREVIOUS_DOCK_STORAGE_KEY = "braze.editor.dock-layout.v2";
export const LEGACY_DOCK_STORAGE_KEY = "braze.editor.dock-layout.v1";
const STORAGE_KIND = "braze/editor-dock-layout";
const STORAGE_VERSION = 3;
const HEADER_HEIGHT = 38;

type StoredDockLayout = {
  kind: typeof STORAGE_KIND;
  version: typeof STORAGE_VERSION;
  document: DockLayoutDocument;
};

export type DockStorageReader = Pick<Storage, "getItem">;
export type DockStorageWriter = Pick<Storage, "setItem">;

export function parseStoredDockDocument(raw: string | null): DockLayoutDocument | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object") {
      const candidate = value as { kind?: unknown; version?: unknown; document?: unknown };
      if (candidate.kind === STORAGE_KIND && (
        candidate.version === 1
        || candidate.version === 2
        || candidate.version === STORAGE_VERSION
      )) {
        return parseDockDocument(candidate.document);
      }
    }
    // A short-lived preview build wrote the direct document shape.
    return parseDockDocument(value);
  } catch {
    return null;
  }
}

function storedNumber(storage: DockStorageReader, key: string, fallback: number): number {
  try {
    const value = Number.parseFloat(storage.getItem(key) ?? "");
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function recoverDockDocument(input: {
  storage: DockStorageReader;
  viewportWidth: number;
  viewportHeight: number;
}): DockLayoutDocument {
  const current = parseStoredDockDocument(input.storage.getItem(DOCK_STORAGE_KEY));
  if (current) return current;
  const previous = parseStoredDockDocument(input.storage.getItem(PREVIOUS_DOCK_STORAGE_KEY));
  if (previous) return previous;
  const legacy = parseStoredDockDocument(input.storage.getItem(LEGACY_DOCK_STORAGE_KEY));
  if (legacy) return legacy;
  return dockDocumentFromLegacySizes({
    workspaceWidth: Math.max(1, input.viewportWidth),
    workspaceHeight: Math.max(1, input.viewportHeight - HEADER_HEIGHT),
    hierarchyWidth: storedNumber(input.storage, "tgan.railLeftWidth", 340),
    inspectorWidth: storedNumber(input.storage, "tgan.railRightWidth", 372),
    projectHeight: storedNumber(input.storage, "braze.projectHeight", 270),
  });
}

export function readInitialDockDocument(): DockLayoutDocument {
  if (typeof window === "undefined") return DEFAULT_DOCK_DOCUMENT;
  try {
    return recoverDockDocument({
      storage: window.localStorage,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  } catch {
    return DEFAULT_DOCK_DOCUMENT;
  }
}

export function persistDockDocument(
  document: DockLayoutDocument,
  storage: DockStorageWriter | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const value: StoredDockLayout = {
      kind: STORAGE_KIND,
      version: STORAGE_VERSION,
      document,
    };
    storage.setItem(DOCK_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is optional; the in-memory layout remains usable.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
