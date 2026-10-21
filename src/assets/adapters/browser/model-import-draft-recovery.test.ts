import { describe, expect, it } from "vitest";
import {
  defaultModelImportSettings,
  type ModelImportSettings,
} from "../../../lib/model-import-settings";
import {
  clearModelImportDraftRecovery,
  readModelImportDraftRecovery,
  writeModelImportDraftRecovery,
  type ModelImportDraftRecoveryStorage,
} from "./model-import-draft-recovery";

class MemoryStorage implements ModelImportDraftRecoveryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const BASE_REVISION = "metadata-r1";
const ASSET_GUID = "asset-guid-1";

function settingsWithEvent(name = "Footstep"): ModelImportSettings {
  return {
    ...defaultModelImportSettings,
    clipSettings: {
      "clip:idle": {
        looping: true,
        events: [{ id: "event-1", name, timeSeconds: 0.5, payload: {} }],
      },
    },
  };
}

function writeDraft(
  storage: MemoryStorage,
  draftSettings: ModelImportSettings = settingsWithEvent(),
) {
  return writeModelImportDraftRecovery(storage, {
    assetGuid: ASSET_GUID,
    sourceFilename: "characters/hero.gltf",
    baseRevision: BASE_REVISION,
    baseSettings: defaultModelImportSettings,
    draftSettings,
  });
}

describe("model importer browser draft recovery", () => {
  it("recovers a dirty draft against its exact canonical revision", () => {
    const storage = new MemoryStorage();
    expect(writeDraft(storage)).toEqual({ ok: true });

    const result = readModelImportDraftRecovery(storage, {
      assetGuid: ASSET_GUID,
      canonicalRevision: BASE_REVISION,
      canonicalSettings: defaultModelImportSettings,
    });

    expect(result.status).toBe("recovered");
    expect(result.status === "recovered" && result.draftSettings).toEqual(settingsWithEvent());
  });

  it("recovers after an unrelated revision change when canonical settings still match the base", () => {
    const storage = new MemoryStorage();
    writeDraft(storage);

    expect(readModelImportDraftRecovery(storage, {
      assetGuid: ASSET_GUID,
      canonicalRevision: "metadata-r2",
      canonicalSettings: defaultModelImportSettings,
    }).status).toBe("recovered");
  });

  it("surfaces a conflict instead of promoting recovery over changed canonical settings", () => {
    const storage = new MemoryStorage();
    writeDraft(storage);

    const result = readModelImportDraftRecovery(storage, {
      assetGuid: ASSET_GUID,
      canonicalRevision: "metadata-r2",
      canonicalSettings: { ...defaultModelImportSettings, importLights: true },
    });

    expect(result.status).toBe("conflict");
    expect(result.status === "conflict" && result.draftSettings).toEqual(settingsWithEvent());
    expect(storage.values.size).toBe(1);
  });

  it("drops stale recovery when Apply already made the draft canonical", () => {
    const storage = new MemoryStorage();
    writeDraft(storage);

    expect(readModelImportDraftRecovery(storage, {
      assetGuid: ASSET_GUID,
      canonicalRevision: "metadata-r2",
      canonicalSettings: settingsWithEvent(),
    })).toEqual({ status: "none" });
    expect(storage.values.size).toBe(0);
  });

  it("isolates recovery by stable asset GUID and clears it explicitly", () => {
    const storage = new MemoryStorage();
    writeDraft(storage);

    expect(readModelImportDraftRecovery(storage, {
      assetGuid: "another-guid",
      canonicalRevision: BASE_REVISION,
      canonicalSettings: defaultModelImportSettings,
    })).toEqual({ status: "none" });
    expect(clearModelImportDraftRecovery(storage, ASSET_GUID)).toEqual({ ok: true });
    expect(storage.values.size).toBe(0);
  });

  it("discards malformed recovery without treating it as authored settings", () => {
    const storage = new MemoryStorage();
    writeDraft(storage);
    const key = [...storage.values.keys()][0]!;
    storage.values.set(key, "{not-json");

    expect(readModelImportDraftRecovery(storage, {
      assetGuid: ASSET_GUID,
      canonicalRevision: BASE_REVISION,
      canonicalSettings: defaultModelImportSettings,
    }).status).toBe("error");
    expect(storage.values.size).toBe(0);
  });

  it("rejects drafts that exceed the bounded recovery payload", () => {
    const storage = new MemoryStorage();
    const payload = Object.fromEntries(Array.from(
      { length: 32 },
      (_, index) => [`field-${index}`, "x".repeat(4_096)],
    ));
    const oversized = settingsWithEvent();
    oversized.clipSettings["clip:idle"]!.events = Array.from({ length: 3 }, (_, index) => ({
      id: `event-${index}`,
      name: `Event ${index}`,
      timeSeconds: index,
      payload,
    }));

    const result = writeDraft(storage, oversized);

    expect(result.ok).toBe(false);
    expect(storage.values.size).toBe(0);
  });
});
