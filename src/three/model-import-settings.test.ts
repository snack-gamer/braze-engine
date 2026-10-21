import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installBundledModelImportSettings,
  loadModelImportSettings,
} from "./model-import-settings";

afterEach(() => vi.unstubAllGlobals());

describe("bundled model import settings", () => {
  it("resolves relative subpath-hosted player assets without calling editor APIs", async () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/games/demo/player.html" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const uninstall = installBundledModelImportSettings({
      "Characters/Hero.fbx": { scaleFactor: 2, importAnimations: false },
    });

    const settings = await loadModelImportSettings("./3d-models/Characters/Hero.fbx");

    expect(settings.scaleFactor).toBe(2);
    expect(settings.importAnimations).toBe(false);
    expect(Object.isFrozen(settings)).toBe(true);
    expect(Object.isFrozen(settings.rig)).toBe(true);
    expect(Object.isFrozen(settings.clipSettings)).toBe(true);
    expect(() => { settings.scaleFactor = 9; }).toThrow(TypeError);
    expect((await loadModelImportSettings("./3d-models/Characters/Hero.fbx")).scaleFactor).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    uninstall();
  });

  it("validates a complete batch before publishing any setting", async () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/player.html" } });
    const fetchMock = editorFallback();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => installBundledModelImportSettings({
      "Partial/Good.fbx": { scaleFactor: 7 },
      "../Partial/Bad.fbx": { scaleFactor: 8 },
    })).toThrow("Invalid bundled model import settings filename");

    expect((await loadModelImportSettings("./3d-models/Partial/Good.fbx")).scaleFactor).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects canonical collisions without replacing an existing setting", async () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/player.html" } });
    vi.stubGlobal("fetch", editorFallback());
    const uninstall = installBundledModelImportSettings({
      "Collisions/Hero.fbx": { scaleFactor: 2 },
    });
    try {
      expect(() => installBundledModelImportSettings({
        "Collisions/Hero.fbx": { scaleFactor: 3 },
        "/Collisions\\Hero.fbx": { scaleFactor: 4 },
      })).toThrow("normalize to the same key");
      expect((await loadModelImportSettings("./3d-models/Collisions/Hero.fbx")).scaleFactor).toBe(2);
    } finally {
      uninstall();
    }
  });

  it("restores the exact predecessor when a canonical alias is uninstalled", async () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/player.html" } });
    vi.stubGlobal("fetch", editorFallback());
    const uninstallOriginal = installBundledModelImportSettings({
      "Restoration/Hero.fbx": { scaleFactor: 2 },
    });
    const uninstallOverride = installBundledModelImportSettings({
      "/Restoration/./Hero.fbx": { scaleFactor: 6 },
    });
    try {
      expect((await loadModelImportSettings("./3d-models/Restoration/Hero.fbx")).scaleFactor).toBe(6);
      uninstallOverride();
      expect((await loadModelImportSettings("./3d-models/Restoration/Hero.fbx")).scaleFactor).toBe(2);
    } finally {
      uninstallOverride();
      uninstallOriginal();
    }
  });

  it("does not clobber or resurrect layers when owners uninstall out of order", async () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/player.html" } });
    vi.stubGlobal("fetch", editorFallback());
    const uninstallOriginal = installBundledModelImportSettings({
      "OutOfOrder/Hero.fbx": { scaleFactor: 2 },
    });
    const uninstallOverride = installBundledModelImportSettings({
      "OutOfOrder/Hero.fbx": { scaleFactor: 6 },
    });

    uninstallOriginal();
    expect((await loadModelImportSettings("./3d-models/OutOfOrder/Hero.fbx")).scaleFactor).toBe(6);

    uninstallOverride();
    expect((await loadModelImportSettings("./3d-models/OutOfOrder/Hero.fbx")).scaleFactor).toBe(1);
  });

  it("preserves nested 3d-models directories under a subpath-hosted player", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.test/hosting/3d-models/demo/player.html" },
    });
    const fetchMock = editorFallback();
    vi.stubGlobal("fetch", fetchMock);
    const uninstall = installBundledModelImportSettings({
      "Characters/3d-models/Hero.fbx": { scaleFactor: 8 },
    });

    const settings = await loadModelImportSettings(
      "./3d-models/Characters/3d-models/Hero.fbx",
    );

    expect(settings.scaleFactor).toBe(8);
    expect(fetchMock).not.toHaveBeenCalled();
    uninstall();
  });
});

function editorFallback() {
  return vi.fn(async () => ({
    ok: false,
    json: async () => ({ status: "error" }),
  }));
}
