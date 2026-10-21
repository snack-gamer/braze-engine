import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { releaseModelPreviewContent } from "./model-preview-content";

describe("model preview content", () => {
  it("releases scene and clone resources when extension detach fails", () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const object = new THREE.Mesh(geometry, material);
    scene.add(object);
    const failure = new Error("extension detach failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    releaseModelPreviewContent(
      scene,
      { attach: vi.fn(), detach: vi.fn(() => { throw failure; }), dispose: vi.fn() },
      { source: { object, animations: [] } },
    );

    expect(object.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      "[asset-preview] Failed to dispose model preview attachment.",
      failure,
    );
    report.mockRestore();
  });
});
