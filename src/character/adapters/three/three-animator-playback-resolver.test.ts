import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AnimatorComponent } from "../../domain/animator-component";
import type { AnimatorController } from "../../domain/animator-controller";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import { defaultModelImportSettings } from "../../../lib/model-import-settings";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import {
  animationClipForRootMotionExtraction,
  applyAnimationClipLoopPose,
} from "../../../three/animation-clip-loop-pose";
import { createThreeAnimatorPlaybackAssetResolver } from "./three-animator-playback-resolver";

const CONTROLLER_GUID = "a".repeat(32);
const TARGET_GUID = "b".repeat(32);
const SOURCE_GUID = "c".repeat(32);

function animator(): AnimatorComponent {
  return {
    version: 1,
    enabled: true,
    controllerRef: { guid: CONTROLLER_GUID, localId: "main" },
    rootMotion: {
      mode: "disabled",
      source: "clip",
      translationAxes: { x: true, y: true, z: true },
      rotation: "yaw",
      bakeIntoPose: false,
    },
    updateMode: "normal",
    cullingMode: "alwaysAnimate",
    parameterOverrides: [],
  };
}

function controller(clipGuid = TARGET_GUID): AnimatorController & { revision: string } {
  return {
    version: 1,
    id: CONTROLLER_GUID,
    name: "Controller",
    revision: "controller-r1",
    parameters: [],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "idle",
      anyStateTransitions: [],
      states: [{
        id: "idle",
        name: "Idle",
        motion: { kind: "clip", clipRef: { guid: clipGuid, localId: "clip:take-2" }, speed: 1 },
        speed: 1,
        cycleOffset: 0,
        mirror: false,
        footIk: false,
        writeDefaults: true,
        transitions: [],
        events: [],
      }],
    }],
  };
}

function library(clipGuid = TARGET_GUID): CharacterAssetLibrary {
  return { version: 1, animatorControllers: [controller(clipGuid)], avatarMasks: [], extensions: {} };
}

function model(guid: string, filename: string): LibraryAsset {
  return {
    guid,
    name: filename,
    filename,
    path: `assets/${filename}`,
    url: `/3d-models/${filename}`,
    sizeBytes: 1,
    contentRevision: "content-r1",
    subAssets: [{ localId: "clip:take-2", kind: "clip", name: "Take", sourceIndex: 1 }],
  };
}

function object(): SceneObject {
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
    assetUrl: "/3d-models/hero.glb",
    animator: animator(),
  };
}

function importDocument(filename: string): ModelImportDocument {
  return {
    version: "1",
    sourceFilename: filename,
    settings: defaultModelImportSettings,
    revision: `${filename}-meta-r1`,
    updatedAt: null,
    importVersion: `${filename}-r1`,
  };
}

function genericImportDocument(filename: string): ModelImportDocument {
  const imported = importDocument(filename);
  return {
    ...imported,
    settings: {
      ...imported.settings,
      rig: {
        kind: "generic",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
      },
    },
  };
}

function createGenericRig(): THREE.Group {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.y = 1;
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

describe("Three Animator playback asset resolver", () => {
  it("resolves an FBX local clip by durable source index from the Play-entry snapshot", async () => {
    const acquire = vi.fn();
    const target = model(TARGET_GUID, "hero.fbx");
    const targetObject: SceneObject = {
      ...object(),
      primitive: "fbx",
      assetUrl: "/3d-models/hero.fbx",
    };
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime: { disposed: false, assetCache: { acquire, dispose: vi.fn() } },
      catalog: { library: library(), importedAssets: [target] },
      objects: [targetObject],
      loadModelImport: async (filename) => importDocument(filename),
    });
    const body = new THREE.Group();
    const clips = [
      new THREE.AnimationClip("Take", 1, []),
      new THREE.AnimationClip("Take", 2, []),
    ];
    body.userData.animationClips = clips;

    const resolved = await resolver.resolve(targetObject, body);
    expect(resolved.value?.clips[0]?.resource.bindings[0]?.clip).toBe(clips[1]);
    expect(acquire).not.toHaveBeenCalled();
    resolver.dispose();
  });

  it("uses authored clip curves only while root motion is being extracted", async () => {
    const target = model(TARGET_GUID, "hero.glb");
    target.subAssets = [
      ...(target.subAssets ?? []),
      { localId: "avatar:main", kind: "avatar", name: "Avatar" },
    ];
    const extractingObject: SceneObject = {
      ...object(),
      animator: {
        ...animator(),
        rootMotion: { ...animator().rootMotion, mode: "extractOnly" },
      },
    };
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime: { disposed: false, assetCache: { acquire: vi.fn(), dispose: vi.fn() } },
      catalog: { library: library(), importedAssets: [target] },
      objects: [extractingObject],
      loadModelImport: async (filename) => genericImportDocument(filename),
    });
    const body = createGenericRig();
    const conditioned = new THREE.AnimationClip("Take", 1, [
      new THREE.VectorKeyframeTrack(".bones[Hips].position", [0, 1], [0, 1, 0, 10, 1, 0]),
    ]);
    applyAnimationClipLoopPose(conditioned);
    const rootMotionSource = animationClipForRootMotionExtraction(conditioned);
    body.userData.animationClips = [new THREE.AnimationClip("Take", 1, []), conditioned];

    const extracted = await resolver.resolve(extractingObject, body);
    const disabled = await resolver.resolve(object(), body);
    const baked = await resolver.resolve({
      ...extractingObject,
      animator: {
        ...extractingObject.animator!,
        rootMotion: { ...extractingObject.animator!.rootMotion, bakeIntoPose: true },
      },
    }, body);

    expect(extracted.value?.clips[0]?.resource.bindings[0]?.clip).toBe(rootMotionSource);
    expect(disabled.value?.clips[0]?.resource.bindings[0]?.clip).toBe(conditioned);
    expect(baked.value?.clips[0]?.resource.bindings[0]?.clip).toBe(conditioned);
    resolver.dispose();
  });

  it("defers external source model acquisition until a character resolves", async () => {
    const acquire = vi.fn();
    const target = model(TARGET_GUID, "hero.glb");
    const source = model(SOURCE_GUID, "motions.glb");
    const runtime = { disposed: false, assetCache: { acquire, dispose: vi.fn() } } as Pick<Runtime, "disposed" | "assetCache">;
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime,
      catalog: { library: library(SOURCE_GUID), importedAssets: [target, source] },
      objects: [object()],
      loadModelImport: async (filename) => importDocument(filename),
    });

    await Promise.resolve();
    expect(acquire).not.toHaveBeenCalled();
    resolver.dispose();
    resolver.dispose();
    expect(acquire).not.toHaveBeenCalled();
  });

  it("returns a structured diagnostic after the snapshot is disposed", async () => {
    const target = model(TARGET_GUID, "hero.glb");
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime: { disposed: false, assetCache: { acquire: vi.fn(), dispose: vi.fn() } },
      catalog: { library: library(), importedAssets: [target] },
      objects: [object()],
      loadModelImport: async (filename) => importDocument(filename),
    });
    resolver.dispose();

    const resolved = await resolver.resolve(object(), new THREE.Group());
    expect(resolved.value).toBeNull();
    expect(resolved.diagnostics[0]?.code).toBe("disposed-animator-asset-resolver");
  });

  it("does not treat a model subasset reference as the target main asset", async () => {
    const target = model(TARGET_GUID, "hero.glb");
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime: { disposed: false, assetCache: { acquire: vi.fn(), dispose: vi.fn() } },
      catalog: { library: library(), importedAssets: [target] },
      objects: [object()],
      loadModelImport: async (filename) => importDocument(filename),
    });

    const resolved = await resolver.resolve({
      ...object(),
      assetRef: { guid: TARGET_GUID, localId: "mesh:body" },
    }, new THREE.Group());
    expect(resolved.value).toBeNull();
    expect(resolved.diagnostics[0]?.code).toBe("missing-animator-target-model");
    resolver.dispose();
  });

  it("bounds target model import snapshots to the live-session budget", () => {
    const entries = Array.from({ length: 49 }, (_, index) => {
      const guid = index.toString(16).padStart(32, "0");
      return {
        asset: model(guid, `model-${index}.glb`),
        object: {
          ...object(),
          id: `character-${index}`,
          assetRef: { guid, localId: "main" },
        },
      };
    });
    const loadModelImport = vi.fn(async (filename: string) => importDocument(filename));
    const resolver = createThreeAnimatorPlaybackAssetResolver({
      runtime: { disposed: false, assetCache: { acquire: vi.fn(), dispose: vi.fn() } },
      catalog: {
        library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} },
        importedAssets: entries.map((entry) => entry.asset),
      },
      objects: entries.map((entry) => entry.object),
      loadModelImport,
    });

    expect(loadModelImport).toHaveBeenCalledTimes(32);
    resolver.dispose();
  });

});
