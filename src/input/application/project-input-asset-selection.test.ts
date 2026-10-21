import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/asset-api";
import { selectableProjectInputAssets, selectedProjectInputAsset } from "./project-input-asset-selection";

const guid = "a".repeat(32);
const asset = (patch: Partial<LibraryAsset> = {}): LibraryAsset => ({ guid, kind: "inputActionMap",
  importerId: "braze.input-action-map", status: "ready", name: "Controls", filename: "Controls.braze-input.json",
  path: "Assets/Controls.braze-input.json", url: "/3d-models/Controls.braze-input.json", sizeBytes: 100, ...patch });

describe("project Input Action Map selection", () => {
  it("resolves moved assets by GUID and keeps missing identities explicit", () => {
    const moved = asset({ filename: "Input/Moved.braze-input.json", name: "Moved" });
    expect(selectedProjectInputAsset(guid.toUpperCase(), [moved])).toEqual({ asset: moved, problem: "" });
    expect(selectedProjectInputAsset(guid, []).problem).toBe("Missing Input Action Map");
    expect(selectedProjectInputAsset(undefined, []).problem).toBe("");
  });
  it("excludes duplicate GUIDs across all families instead of choosing the first source", () => {
    const first = asset(), other = asset({ kind: "model", filename: "other.glb" });
    expect(selectedProjectInputAsset(guid, [first, other]).problem).toContain("Ambiguous");
    expect(selectableProjectInputAssets([first, other])).toEqual([]);
  });
  it("retains diagnostics for failed, pending and wrong-kind selected assets", () => {
    for (const patch of [{ status: "failed" as const }, { status: "importing" as const },
      { importerId: "braze.model" }, { kind: "model" as const },
      { diagnostics: [{ code: "bad-map", severity: "error" as const, message: "Malformed map" }] }]) {
      const invalid = asset(patch);
      expect(selectedProjectInputAsset(guid, [invalid]).problem).not.toBe("");
      expect(selectableProjectInputAssets([invalid])).toEqual([]);
    }
  });
  it("offers only unique ready validated input assets", () => {
    const valid = asset(), missing = asset({ guid: "b".repeat(32), status: "missing" });
    expect(selectableProjectInputAssets([valid, missing])).toEqual([valid]);
  });
});
