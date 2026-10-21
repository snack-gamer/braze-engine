import { describe, expect, it } from "vitest";
import {
  bundledModelImportDocument,
  installBundledModelImportDocuments,
  type RuntimeModelImportDocument,
} from "./model-import-document-provider";

describe("bundled model import documents", () => {
  it("owns a normalized immutable playback snapshot for one player lifetime", () => {
    const uninstall = installBundledModelImportDocuments({
      "Characters/Hero.fbx": importDocument("import-r1", 2),
    });

    const document = bundledModelImportDocument("Characters\\Hero.fbx");
    expect(document).toMatchObject({
      sourceFilename: "Characters/Hero.fbx",
      importVersion: "import-r1",
      settings: { scaleFactor: 2, importAnimations: true },
    });
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document?.settings)).toBe(true);
    expect(Object.isFrozen(document?.settings.rig)).toBe(true);
    expect(Object.isFrozen(document?.settings.clipSettings)).toBe(true);
    expect(() => {
      if (document) document.settings.scaleFactor = 9;
    }).toThrow(TypeError);
    expect(bundledModelImportDocument("Characters/Hero.fbx")?.settings.scaleFactor).toBe(2);
    uninstall();
    expect(bundledModelImportDocument("Characters/Hero.fbx")).toBeNull();
  });

  it("validates a complete batch before mutating the bundled snapshot", () => {
    expect(() => installBundledModelImportDocuments({
      "Partial/Good.fbx": importDocument("partial-good", 2),
      "../Partial/Bad.fbx": importDocument("partial-bad", 3),
    })).toThrow("Invalid bundled model import filename");

    expect(bundledModelImportDocument("Partial/Good.fbx")).toBeNull();
  });

  it("rejects canonical key collisions without replacing an existing document", () => {
    const uninstall = installBundledModelImportDocuments({
      "Collisions/Hero.fbx": importDocument("original", 2),
    });
    try {
      expect(() => installBundledModelImportDocuments({
        "Collisions/Hero.fbx": importDocument("first-alias", 3),
        "/Collisions\\Hero.fbx": importDocument("second-alias", 4),
      })).toThrow("normalize to the same key");
      expect(bundledModelImportDocument("Collisions/Hero.fbx")?.importVersion).toBe("original");
    } finally {
      uninstall();
    }
  });

  it("restores the exact predecessor when a canonical alias is uninstalled", () => {
    const uninstallOriginal = installBundledModelImportDocuments({
      "Restoration/Hero.fbx": importDocument("original", 2),
    });
    const uninstallOverride = installBundledModelImportDocuments({
      "/Restoration/./Hero.fbx": importDocument("override", 6),
    });
    try {
      expect(bundledModelImportDocument("Restoration/Hero.fbx")?.importVersion).toBe("override");
      uninstallOverride();
      expect(bundledModelImportDocument("Restoration/Hero.fbx")?.importVersion).toBe("original");
    } finally {
      uninstallOverride();
      uninstallOriginal();
    }
  });

  it("does not clobber or resurrect layers when owners uninstall out of order", () => {
    const uninstallOriginal = installBundledModelImportDocuments({
      "OutOfOrder/Hero.fbx": importDocument("original", 2),
    });
    const uninstallOverride = installBundledModelImportDocuments({
      "OutOfOrder/Hero.fbx": importDocument("override", 6),
    });

    uninstallOriginal();
    expect(bundledModelImportDocument("OutOfOrder/Hero.fbx")?.importVersion).toBe("override");

    uninstallOverride();
    expect(bundledModelImportDocument("OutOfOrder/Hero.fbx")).toBeNull();
  });
});

function importDocument(importVersion: string, scaleFactor: number): RuntimeModelImportDocument {
  return {
    version: "braze/model-import-v3",
    sourceFilename: "ignored.fbx",
    settings: { scaleFactor } as never,
    revision: `meta-${importVersion}`,
    updatedAt: null,
    importVersion,
  };
}
