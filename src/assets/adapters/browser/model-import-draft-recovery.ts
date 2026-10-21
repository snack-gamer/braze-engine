import {
  normalizeModelImportSettings,
  type ModelImportSettings,
} from "../../../lib/model-import-settings";

const STORAGE_PREFIX = "braze.editor.model-import-draft.v1.";
const STORAGE_KIND = "braze/model-import-draft-recovery";
const STORAGE_VERSION = 1;
const MAX_RECOVERY_BYTES = 240 * 1024;

export type ModelImportDraftRecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type StoredModelImportDraft = Readonly<{
  kind: typeof STORAGE_KIND;
  version: typeof STORAGE_VERSION;
  assetGuid: string;
  sourceFilename: string;
  baseRevision: string;
  baseSettings: ModelImportSettings;
  draftSettings: ModelImportSettings;
  updatedAt: string;
}>;

export type ModelImportDraftRecoveryReadResult =
  | Readonly<{ status: "none" }>
  | Readonly<{
      status: "recovered";
      draftSettings: ModelImportSettings;
      updatedAt: string;
    }>
  | Readonly<{
      status: "conflict";
      draftSettings: ModelImportSettings;
      message: string;
    }>
  | Readonly<{ status: "error"; message: string }>;

export type ModelImportDraftRecoveryWriteResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

type ReadInput = Readonly<{
  assetGuid: string;
  canonicalRevision: string;
  canonicalSettings: ModelImportSettings;
}>;

type WriteInput = Readonly<{
  assetGuid: string;
  sourceFilename: string;
  baseRevision: string;
  baseSettings: ModelImportSettings;
  draftSettings: ModelImportSettings;
}>;

export function browserModelImportDraftRecoveryStorage(): ModelImportDraftRecoveryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readModelImportDraftRecovery(
  storage: ModelImportDraftRecoveryStorage,
  input: ReadInput,
): ModelImportDraftRecoveryReadResult {
  const key = recoveryKey(input.assetGuid);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: "error", message: unavailableMessage() };
  }
  if (!raw) return { status: "none" };

  const stored = parseStoredDraft(raw, input.assetGuid);
  if (!stored) {
    clearUnreadableRecovery(storage, key);
    return { status: "error", message: "An unreadable importer recovery draft was discarded." };
  }

  const baseSettings = normalizeModelImportSettings(stored.baseSettings);
  const draftSettings = normalizeModelImportSettings(stored.draftSettings);
  const canonicalSettings = normalizeModelImportSettings(input.canonicalSettings);
  if (settingsEqual(baseSettings, draftSettings)) {
    clearUnreadableRecovery(storage, key);
    return { status: "none" };
  }
  // Apply may have succeeded even if the browser later refused to remove its
  // recovery key. A draft identical to canonical metadata is no longer dirty.
  if (settingsEqual(draftSettings, canonicalSettings)) {
    clearUnreadableRecovery(storage, key);
    return { status: "none" };
  }
  if (
    stored.baseRevision === input.canonicalRevision
    || settingsEqual(baseSettings, canonicalSettings)
  ) {
    return {
      status: "recovered",
      draftSettings,
      updatedAt: stored.updatedAt,
    };
  }
  return {
    status: "conflict",
    draftSettings,
    message: "Recovered import settings conflict with newer asset metadata. Revert to discard the recovered draft; Apply is blocked to protect the sidecar.",
  };
}

export function writeModelImportDraftRecovery(
  storage: ModelImportDraftRecoveryStorage,
  input: WriteInput,
): ModelImportDraftRecoveryWriteResult {
  const assetGuid = input.assetGuid.trim();
  if (!assetGuid) {
    return { ok: false, message: "Draft recovery requires a stable asset GUID." };
  }
  const stored: StoredModelImportDraft = {
    kind: STORAGE_KIND,
    version: STORAGE_VERSION,
    assetGuid,
    sourceFilename: input.sourceFilename,
    baseRevision: input.baseRevision,
    baseSettings: normalizeModelImportSettings(input.baseSettings),
    draftSettings: normalizeModelImportSettings(input.draftSettings),
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(stored);
  if (new TextEncoder().encode(serialized).byteLength > MAX_RECOVERY_BYTES) {
    return {
      ok: false,
      message: "This importer draft is too large for browser recovery. Apply & Reimport before closing the editor.",
    };
  }
  try {
    storage.setItem(recoveryKey(assetGuid), serialized);
    return { ok: true };
  } catch {
    return { ok: false, message: unavailableMessage() };
  }
}

export function clearModelImportDraftRecovery(
  storage: ModelImportDraftRecoveryStorage,
  assetGuid: string,
): ModelImportDraftRecoveryWriteResult {
  try {
    storage.removeItem(recoveryKey(assetGuid));
    return { ok: true };
  } catch {
    return { ok: false, message: unavailableMessage() };
  }
}

function parseStoredDraft(raw: string, assetGuid: string): StoredModelImportDraft | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)
      || value.kind !== STORAGE_KIND
      || value.version !== STORAGE_VERSION
      || value.assetGuid !== assetGuid
      || typeof value.sourceFilename !== "string"
      || typeof value.baseRevision !== "string"
      || typeof value.updatedAt !== "string"
      || !isRecord(value.baseSettings)
      || !isRecord(value.draftSettings)) return null;
    return value as StoredModelImportDraft;
  } catch {
    return null;
  }
}

function clearUnreadableRecovery(storage: ModelImportDraftRecoveryStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // The read result still blocks any claim that recovery succeeded.
  }
}

function recoveryKey(assetGuid: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(assetGuid.trim())}`;
}

function settingsEqual(left: ModelImportSettings, right: ModelImportSettings): boolean {
  return jsonEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && jsonEqual(left[key], right[key])
    ));
}

function unavailableMessage(): string {
  return "Browser draft recovery is unavailable. Apply & Reimport before closing the editor.";
}
