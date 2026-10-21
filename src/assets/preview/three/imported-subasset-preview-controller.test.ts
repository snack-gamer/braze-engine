import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { ModelPreviewExtensionContext } from "../model-preview-extension";
import { stampTraversalSubAssetBindings } from "../../../three/imported-subasset-bindings";
import { getImportedObjectPath } from "../../../three/imported-object-path";
import {
  createThreeMaterialSubAssetPreviewController,
  createThreeMeshSubAssetPreviewController,
} from "./imported-subasset-preview-controller";

function previewContext(root: THREE.Object3D) {
  const scene = new THREE.Scene();
  scene.add(root);
  const requestRender = vi.fn();
  const context: ModelPreviewExtensionContext = {
    canvas: {} as HTMLCanvasElement,
    scene,
    camera: new THREE.PerspectiveCamera(),
    root,
    animations: [],
    requestRender,
  };
  return { context, requestRender, scene };
}

describe("imported subasset preview controllers", () => {
  it("isolates an exact mesh and restores every authored visibility value", () => {
    const root = new THREE.Group();
    const selected = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    selected.name = "Selected";
    selected.visible = false;
    const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    other.name = "Other";
    other.visible = true;
    root.add(other, selected);
    stampTraversalSubAssetBindings(root);
    const { context, requestRender } = previewContext(root);
    const controller = createThreeMeshSubAssetPreviewController({
      kind: "mesh",
      localId: "mesh:selected",
      name: "Selected",
      sourceIndex: null,
      nodePath: getImportedObjectPath(root, selected),
    });

    const attachment = controller.attach(context);

    expect(attachment?.frameObjects).toEqual([selected]);
    expect(selected.visible).toBe(true);
    expect(other.visible).toBe(false);
    expect(root.visible).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();

    controller.detach();
    expect(selected.visible).toBe(false);
    expect(other.visible).toBe(true);

    controller.dispose();
    expect(() => controller.attach(context)).toThrow("Mesh preview controller is disposed");
  });

  it("previews an exact bound material on an owned sphere and cleans it up", () => {
    const root = new THREE.Group();
    const firstMaterial = new THREE.MeshStandardMaterial({ color: "red" });
    const selectedMaterial = new THREE.MeshStandardMaterial({ color: "blue" });
    const first = new THREE.Mesh(new THREE.BoxGeometry(), firstMaterial);
    first.name = "First";
    const selectedBinding = new THREE.Mesh(
      new THREE.BoxGeometry(),
      [firstMaterial, selectedMaterial],
    );
    selectedBinding.name = "Selected Binding";
    selectedBinding.visible = false;
    root.add(first, selectedBinding);
    const { context, requestRender, scene } = previewContext(root);
    const controller = createThreeMaterialSubAssetPreviewController({
      kind: "material",
      localId: "material:selected",
      name: "Blue",
      sourceIndex: null,
      bindings: [{
        nodePath: getImportedObjectPath(root, selectedBinding),
        slot: 1,
      }],
    });

    const attachment = controller.attach(context);
    const sphere = attachment?.frameObjects[0] as THREE.Mesh<THREE.SphereGeometry, THREE.Material>;
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    sphere.geometry.addEventListener("dispose", geometryDisposed);
    sphere.material.addEventListener("dispose", materialDisposed);

    expect(sphere.name).toBe("Blue Material Preview");
    expect(sphere.parent).toBe(scene);
    expect(sphere.material).not.toBe(selectedMaterial);
    expect((sphere.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("0000ff");
    expect(first.visible).toBe(false);
    expect(selectedBinding.visible).toBe(false);
    expect(requestRender).toHaveBeenCalledOnce();

    controller.detach();
    expect(sphere.parent).toBeNull();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(first.visible).toBe(true);
    expect(selectedBinding.visible).toBe(false);

    controller.dispose();
    expect(() => controller.attach(context)).toThrow("Material preview controller is disposed");
  });
});
