import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  stampGltfSubAssetBindings,
  stampTraversalSubAssetBindings,
} from "../../../three/imported-subasset-bindings";
import {
  bindExtractedThreeSkeleton,
  createThreeSkeletonHelperOverlay,
  extractThreeSkeletonDefinition,
  getThreeObjectPath,
  hasThreeSkinnedContent,
} from "./three-skeleton-extractor";

function createSkinnedRoot(): {
  root: THREE.Group;
  hips: THREE.Bone;
  spine: THREE.Bone;
  body: THREE.SkinnedMesh;
  clothing: THREE.SkinnedMesh;
} {
  const root = new THREE.Group();
  root.name = "Character";
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.set(0, 1, 0);
  const spine = new THREE.Bone();
  spine.name = "Spine/Chest";
  spine.position.set(0, 0.5, 0);
  hips.add(spine);
  root.add(hips);
  root.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton([hips, spine]);
  const body = new THREE.SkinnedMesh(skinnedGeometry(), new THREE.MeshBasicMaterial());
  body.name = "Body";
  body.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 0.1, 0,
  ], 3)];
  body.updateMorphTargets();
  body.morphTargetDictionary = { Smile: 0 };
  body.bind(skeleton);
  root.add(body);

  const clothing = new THREE.SkinnedMesh(skinnedGeometry(), new THREE.MeshBasicMaterial());
  clothing.name = "Clothing";
  clothing.bind(skeleton);
  root.add(clothing);
  root.updateMatrixWorld(true);
  return { root, hips, spine, body, clothing };
}

function skinnedGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([
    0, 1, 0, 0,
    0, 1, 0, 0,
  ], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([
    0.8, 0.3, 0, 0,
    0.5, 0.25, 0.25, 0,
  ], 4));
  return geometry;
}

describe("Three skeleton extraction", () => {
  it("extracts every skin with stable bone paths, bind data, and morph targets", () => {
    const { root, hips, spine } = createSkinnedRoot();
    spine.position.y = 2;
    root.updateMatrixWorld(true);
    const first = extractThreeSkeletonDefinition(root, { id: "hero", name: "Hero Rig" });
    const second = extractThreeSkeletonDefinition(root, { id: "hero", name: "Hero Rig" });

    expect(hasThreeSkinnedContent(root)).toBe(true);
    expect(first.definition).toEqual(second.definition);
    expect(first.definition?.id).toBe("hero:skeleton");
    expect(first.definition?.bones.map((bone) => bone.path)).toEqual(["Hips", "Hips/Spine~1Chest"]);
    expect(first.definition?.bones.every((bone) => bone.inverseBindMatrix.length === 16)).toBe(true);
    expect(first.definition?.bones.find((bone) => bone.name === "Spine/Chest")?.bindLocal.translation[1])
      .toBeCloseTo(0.5);
    expect(first.skins).toHaveLength(2);
    expect(first.skins.every((skin) => skin.boneIds.length === 2)).toBe(true);
    expect(first.skins[0]?.maxBoneInfluences).toBe(3);
    expect(first.morphTargets).toEqual([{ nodePath: "Body", name: "Smile", index: 0 }]);
    expect(first.rootCandidates).toEqual([first.definition?.bones[0]?.id]);
    expect(first.diagnostics.map((item) => item.code)).toContain("non-normalized-skin-weights");
    expect(getThreeObjectPath(root, hips)).toBe("Hips");
    expect(getThreeObjectPath(root, spine)).toBe("Hips/Spine~1Chest");
  });

  it("selects an FBX skin by its stamped source path after runtime renaming", () => {
    const { root, body } = createSkinnedRoot();
    stampTraversalSubAssetBindings(root);
    body.name = "Runtime Body";

    const extraction = extractThreeSkeletonDefinition(root, {}, {
      skinNodePaths: ["Body"],
    });

    expect(extraction.definition).not.toBeNull();
    expect(extraction.skins).toHaveLength(1);
    expect(extraction.skins[0]?.name).toBe("Runtime Body");
  });

  it("selects a glTF skin by its exact parser node index", () => {
    const { root, body, clothing } = createSkinnedRoot();
    stampGltfSubAssetBindings(new Map<object, unknown>([
      [body, { nodes: 11 }],
      [clothing, { nodes: 12 }],
    ]));

    const extraction = extractThreeSkeletonDefinition(root, {}, {
      skinSourceNodeIndices: [12],
    });

    expect(extraction.definition).not.toBeNull();
    expect(extraction.skins).toHaveLength(1);
    expect(extraction.skins[0]?.name).toBe("Clothing");
  });

  it("returns no rig for malformed or nonmatching exact selectors", () => {
    const { root, body, clothing } = createSkinnedRoot();
    stampGltfSubAssetBindings(new Map<object, unknown>([
      [body, { nodes: 11 }],
      [clothing, { nodes: 12 }],
    ]));

    for (const options of [
      { skinNodePaths: ["not/an/imported/path"], skinSourceNodeIndices: [999] },
      { skinNodePaths: [""], skinSourceNodeIndices: [Number.NaN] },
    ]) {
      const extraction = extractThreeSkeletonDefinition(root, {}, options);
      expect(extraction.definition).toBeNull();
      expect(extraction.skins).toEqual([]);
      expect(extraction.rootCandidates).toEqual([]);
      expect(extraction.diagnostics.map((item) => item.code)).toEqual(["no-skinned-content"]);
    }
  });

  it("binds serialized BoneIds to the live hierarchy without name guessing", () => {
    const { root, hips, spine } = createSkinnedRoot();
    const extraction = extractThreeSkeletonDefinition(root);
    const definition = extraction.definition!;
    const binding = bindExtractedThreeSkeleton(root, definition);

    expect(binding.diagnostics).toEqual([]);
    expect(binding.boneById.get(definition.bones.find((bone) => bone.name === "Hips")!.id)).toBe(hips);
    expect(binding.idByBone.get(spine)).toBe(definition.bones.find((bone) => bone.name === "Spine/Chest")!.id);

    spine.name = "Renamed";
    const staleBinding = bindExtractedThreeSkeleton(root, definition);
    expect(staleBinding.diagnostics.map((item) => item.code)).toContain("missing-live-bone");
  });

  it("consolidates repeated skin-branch names into one actionable diagnostic", () => {
    const root = new THREE.Group();
    for (const meshName of ["Surface", "Joints"]) {
      const hips = new THREE.Bone();
      hips.name = "mixamorigHips";
      const spine = new THREE.Bone();
      spine.name = "mixamorigSpine";
      hips.add(spine);
      root.add(hips);
      const mesh = new THREE.SkinnedMesh(skinnedGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = meshName;
      mesh.bind(new THREE.Skeleton([hips, spine]));
      root.add(mesh);
    }
    root.updateMatrixWorld(true);

    const extraction = extractThreeSkeletonDefinition(root);
    const duplicateDiagnostics = extraction.diagnostics.filter((item) => item.code === "duplicate-bone-names");

    expect(extraction.skins).toHaveLength(2);
    expect(duplicateDiagnostics).toHaveLength(1);
    expect(duplicateDiagnostics[0]?.message).toContain("2 bone names repeat");
    expect(duplicateDiagnostics[0]?.message).toContain("stable hierarchy paths");
  });

  it("creates a caller-driven helper overlay with idempotent disposal", () => {
    const { root } = createSkinnedRoot();
    const scene = new THREE.Scene();
    const overlay = createThreeSkeletonHelperOverlay(root);
    let disposeEvents = 0;
    overlay.object.geometry.addEventListener("dispose", () => { disposeEvents += 1; });
    scene.add(overlay.object);

    expect(overlay.object.parent).toBe(scene);
    overlay.dispose();
    overlay.dispose();

    expect(overlay.object.parent).toBeNull();
    expect(disposeEvents).toBe(1);
  });

  it("keeps duplicate ordinals distinct from literal bracketed names", () => {
    const root = new THREE.Group();
    const first = new THREE.Bone();
    const second = new THREE.Bone();
    const literal = new THREE.Bone();
    first.name = "Bone";
    second.name = "Bone";
    literal.name = "Bone[2]";
    root.add(first, second, literal);

    expect(getThreeObjectPath(root, second)).toBe("Bone[2]");
    expect(getThreeObjectPath(root, literal)).toBe("Bone~22~3");
  });
});
