import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_DOCUMENT,
  dockDocumentFromLegacySizes,
} from "./layout";
import {
  DOCK_STORAGE_KEY,
  PREVIOUS_DOCK_STORAGE_KEY,
  parseStoredDockDocument,
  persistDockDocument,
  recoverDockDocument,
} from "./dock-persistence";

function storageFrom(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null };
}

describe("dock persistence", () => {
  it("accepts the versioned envelope and direct preview document", () => {
    const direct = JSON.stringify(DEFAULT_DOCK_DOCUMENT);
    const envelope = JSON.stringify({
      kind: "braze/editor-dock-layout",
      version: 3,
      document: DEFAULT_DOCK_DOCUMENT,
    });
    expect(parseStoredDockDocument(direct)).toEqual(DEFAULT_DOCK_DOCUMENT);
    expect(parseStoredDockDocument(envelope)).toEqual(DEFAULT_DOCK_DOCUMENT);
    expect(parseStoredDockDocument("{broken")).toBeNull();
  });

  it("recovers the previous document before migrating fixed pane sizes", () => {
    const previous = {
      ...DEFAULT_DOCK_DOCUMENT,
      root: { ...DEFAULT_DOCK_DOCUMENT.root, ratio: 0.7 },
    };
    const recovered = recoverDockDocument({
      storage: storageFrom({
        [DOCK_STORAGE_KEY]: "invalid",
        [PREVIOUS_DOCK_STORAGE_KEY]: JSON.stringify(previous),
        "tgan.railLeftWidth": "999",
      }),
      viewportWidth: 1600,
      viewportHeight: 1000,
    });
    expect(recovered).toEqual(previous);
  });

  it("migrates a stored pre-Animator layout without resetting its geometry", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_DOCK_DOCUMENT)) as Record<string, unknown>;
    legacy.version = 1;
    legacy.closed = ["animation", "sequencer"];
    const lastDock = legacy.lastDock as Record<string, unknown>;
    delete lastDock.animator;
    delete lastDock.console;
    const root = legacy.root as Record<string, unknown>;
    root.ratio = 0.67;

    const migrated = parseStoredDockDocument(JSON.stringify(legacy));
    expect(migrated?.root).toMatchObject({ ratio: 0.67 });
    expect(migrated?.closed).toContain("animator");
    expect(migrated?.closed).toContain("console");
    expect(migrated?.version).toBe(3);
  });

  it("recovers the previous version-two envelope and adds Console", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_DOCK_DOCUMENT)) as Record<string, unknown>;
    legacy.version = 2;
    legacy.closed = ["animation", "animator", "sequencer"];
    delete (legacy.lastDock as Record<string, unknown>).console;
    const envelope = JSON.stringify({
      kind: "braze/editor-dock-layout",
      version: 2,
      document: legacy,
    });

    const migrated = parseStoredDockDocument(envelope);
    expect(migrated?.version).toBe(3);
    expect(migrated?.closed).toContain("console");
  });

  it("migrates legacy pane dimensions when no document can be recovered", () => {
    const storage = storageFrom({
      "tgan.railLeftWidth": "280",
      "tgan.railRightWidth": "360",
      "braze.projectHeight": "240",
    });
    expect(recoverDockDocument({ storage, viewportWidth: 1440, viewportHeight: 900 })).toEqual(
      dockDocumentFromLegacySizes({
        workspaceWidth: 1440,
        workspaceHeight: 862,
        hierarchyWidth: 280,
        inspectorWidth: 360,
        projectHeight: 240,
      }),
    );
  });

  it("falls back one legacy dimension at a time when storage denies a key", () => {
    const storage = {
      getItem: (key: string) => {
        if (key === "tgan.railLeftWidth") throw new Error("blocked");
        if (key === "tgan.railRightWidth") return "410";
        return null;
      },
    };
    expect(recoverDockDocument({ storage, viewportWidth: 1400, viewportHeight: 900 })).toEqual(
      dockDocumentFromLegacySizes({
        workspaceWidth: 1400,
        workspaceHeight: 862,
        hierarchyWidth: 340,
        inspectorWidth: 410,
        projectHeight: 270,
      }),
    );
  });

  it("writes the versioned envelope", () => {
    let writtenKey = "";
    let writtenValue = "";
    persistDockDocument(DEFAULT_DOCK_DOCUMENT, {
      setItem: (key, value) => {
        writtenKey = key;
        writtenValue = value;
      },
    });
    expect(writtenKey).toBe(DOCK_STORAGE_KEY);
    expect(parseStoredDockDocument(writtenValue)).toEqual(DEFAULT_DOCK_DOCUMENT);
  });
});
