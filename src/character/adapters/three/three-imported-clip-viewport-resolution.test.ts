import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import { defaultModelImportSettings } from "../../../lib/model-import-settings";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { LoadedAsset } from "../../../three/assets";
import type { Runtime } from "../../../three/runtime";
import { createEmptyCharacterAssetLibrary } from "../../domain/character-asset-library";
import { resolveThreeImportedClipViewportTarget } from "./three-imported-clip-viewport-resolution";

const SOURCE_GUID = "a".repeat(32);
const TARGET_GUID = "b".repeat(32);
const clipRef = { guid: SOURCE_GUID, localId: "clip:take" };

describe("Three imported clip viewport resolution", () => {
  it("loads an external source once, targets the selected body, and releases its lease", async () => {
    const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
    const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
    const source = createRig();
    const target = createRig();
    const release = vi.fn();
    const acquire = vi.fn(() => ({
      value: Promise.resolve<LoadedAsset>({
        object: source,
        animations: [new THREE.AnimationClip("Take", 1, [])],
      }),
      release,
    }));
    const runtime = {
      disposed: false,
      assetCache: { acquire, dispose: vi.fn() },
    } as unknown as Runtime;

    const resolved = await resolveThreeImportedClipViewportTarget({
      runtime,
      catalog: {
        library: createEmptyCharacterAssetLibrary(),
        importedAssets: [sourceAsset, targetAsset],
      },
      target: targetObject(),
      targetBody: target,
      clipRef,
      loadModelImport: async (filename) => importDocument(
        filename === sourceAsset.filename ? sourceAsset : targetAsset,
      ),
    });

    expect(resolved.value?.resource.bindings[0]?.root).toBe(target);
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("stops before retargeting a body invalidated during the source load", async () => {
    const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
    const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
    const source = createRig();
    const target = createRig();
    const release = vi.fn();
    let finish!: (asset: LoadedAsset) => void;
    const loaded = new Promise<LoadedAsset>((resolve) => { finish = resolve; });
    let markAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => { markAcquired = resolve; });
    const runtime = {
      disposed: false,
      assetCache: {
        acquire: () => {
          markAcquired();
          return { value: loaded, release };
        },
        dispose: vi.fn(),
      },
    } as unknown as Runtime;
    let current = true;
    const resolution = resolveThreeImportedClipViewportTarget({
      runtime,
      catalog: {
        library: createEmptyCharacterAssetLibrary(),
        importedAssets: [sourceAsset, targetAsset],
      },
      target: targetObject(),
      targetBody: target,
      clipRef,
      isCurrent: () => current,
      loadModelImport: async (filename) => importDocument(
        filename === sourceAsset.filename ? sourceAsset : targetAsset,
      ),
    });
    await acquired;
    current = false;
    finish({ object: source, animations: [new THREE.AnimationClip("Take", 1, [])] });

    const resolved = await resolution;

    expect(resolved.value).toBeNull();
    expect(resolved.diagnostics[0]?.code).toBe("disposed-imported-clip-preview");
    expect(release).toHaveBeenCalledOnce();
  });
});

function targetObject(): SceneObject {
  return {
    id: "hero",
    name: "Hero",
    primitive: "gltf",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetRef: { guid: TARGET_GUID, localId: "main" },
  };
}

function modelAsset(guid: string, filename: string, includeClip: boolean): LibraryAsset {
  return {
    guid,
    name: filename,
    filename,
    path: `assets/${filename}`,
    url: `/3d-models/${filename}`,
    sizeBytes: 1,
    subAssets: [
      ...(includeClip ? [{ localId: "clip:take", kind: "clip" as const, name: "Take", sourceIndex: 0 }] : []),
      { localId: "avatar:main", kind: "avatar", name: "Avatar" },
    ],
  };
}

function importDocument(asset: LibraryAsset): ModelImportDocument {
  return {
    version: "1",
    sourceFilename: asset.filename,
    settings: {
      ...defaultModelImportSettings,
      rig: {
        kind: "generic",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
      },
    },
    revision: `${asset.filename}-metadata-r1`,
    updatedAt: null,
    importVersion: `${asset.filename}-import-r1`,
  };
}

function createRig(): THREE.Group {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  const spine = new THREE.Bone();
  spine.name = "Spine";
  hips.add(spine);
  root.add(hips);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.8, 0.2, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([hips, spine]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}
