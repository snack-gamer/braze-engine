import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  defaultModelImportSettings,
  type ModelImportSettings,
} from "../lib/model-import-settings";
import { prepareImportedAsset } from "./import-prepare";

const ordinaryModel = { botAsset: false, importedLibraryAsset: false };

function settings(overrides: Partial<ModelImportSettings>): ModelImportSettings {
  return { ...defaultModelImportSettings, ...overrides };
}

function offsetBox(): THREE.Group {
  const root = new THREE.Group();
  root.position.set(7, -3, 11);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
  mesh.position.set(5, 2, -4);
  root.add(mesh);
  return root;
}

describe("prepareImportedAsset", () => {
  it("preserves the authored pivot while applying explicit centimeter and scale conversion", () => {
    const root = offsetBox();
    const authoredPosition = root.position.clone();

    prepareImportedAsset(
      root,
      settings({
        fitToEditorSize: false,
        convertUnits: true,
        sourceUnit: "centimeter",
        scaleFactor: 2,
      }),
      ordinaryModel,
    );

    expect(root.position.toArray()).toEqual(authoredPosition.toArray());
    expect(root.scale.toArray()).toEqual([0.02, 0.02, 0.02]);
  });

  it("keeps meter-scale GLB-style assets and their source pivot unchanged", () => {
    const root = offsetBox();
    const authoredPosition = root.position.clone();
    const authoredSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());

    prepareImportedAsset(
      root,
      settings({
        fitToEditorSize: false,
        convertUnits: false,
        sourceUnit: "meter",
        scaleFactor: 1,
      }),
      ordinaryModel,
    );

    const preparedSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    expect(root.position.toArray()).toEqual(authoredPosition.toArray());
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    expect(preparedSize.toArray()).toEqual(authoredSize.toArray());
  });

  it("retains the existing auto-fit recentering behavior", () => {
    const root = offsetBox();
    root.position.set(0, 0, 0);

    prepareImportedAsset(
      root,
      settings({
        fitToEditorSize: true,
        convertUnits: false,
        sourceUnit: "meter",
        scaleFactor: 1,
      }),
      ordinaryModel,
    );

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.7, 6);
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.y).toBeCloseTo(0, 6);
    expect(center.z).toBeCloseTo(0, 6);
  });

  it("fits to the same editor size after source-unit conversion", () => {
    const root = offsetBox();
    root.position.set(0, 0, 0);

    prepareImportedAsset(
      root,
      settings({
        fitToEditorSize: true,
        convertUnits: true,
        sourceUnit: "centimeter",
        scaleFactor: 1,
      }),
      ordinaryModel,
    );

    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.7, 6);
  });

  it("refuses to flatten a skinned hierarchy that owns bone bindings", () => {
    const root = new THREE.Group();
    const authoredParent = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const vertexCount = geometry.getAttribute("position").count;
    const indices = new Uint16Array(vertexCount * 4);
    const weights = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) weights[vertex * 4] = 1;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    authoredParent.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    authoredParent.add(mesh);
    root.add(authoredParent);

    const report = prepareImportedAsset(
      root,
      settings({ preserveHierarchy: false, fitToEditorSize: false }),
      ordinaryModel,
    );

    expect(report.preservedSkinnedHierarchy).toBe(true);
    expect(mesh.parent).toBe(authoredParent);
  });

  it("still flattens an ordinary mesh hierarchy when requested", () => {
    const root = new THREE.Group();
    const authoredParent = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    authoredParent.add(mesh);
    root.add(authoredParent);

    const report = prepareImportedAsset(
      root,
      settings({ preserveHierarchy: false, fitToEditorSize: false }),
      ordinaryModel,
    );

    expect(report.preservedSkinnedHierarchy).toBe(false);
    expect(mesh.parent).toBe(root);
  });
});
