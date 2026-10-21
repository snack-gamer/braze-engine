import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ModelPreviewExtensionContext } from "../../../assets/preview/model-preview-extension";
import { stampGltfSubAssetBindings } from "../../../three/imported-subasset-bindings";
import { createThreeCharacterPreviewController } from "./three-character-preview-extension";

function previewContext(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[] = [],
): Readonly<{
  context: ModelPreviewExtensionContext;
  requestRender: ReturnType<typeof vi.fn>;
  scene: THREE.Scene;
}> {
  const scene = new THREE.Scene();
  scene.add(root);
  const requestRender = vi.fn();
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({
      bottom: 240,
      height: 240,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }) as unknown as HTMLCanvasElement;
  return {
    context: {
      canvas,
      scene,
      camera: new THREE.PerspectiveCamera(),
      root,
      animations,
      requestRender,
    },
    requestRender,
    scene,
  };
}

function previewCallbacks() {
  return {
    onAnalysis: vi.fn(),
    onBoneSelected: vi.fn(),
    onPlayback: vi.fn(),
  };
}

function skinnedGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  return geometry;
}

function addRig(
  root: THREE.Group,
  prefix: string,
): Readonly<{ hips: THREE.Bone; spine: THREE.Bone; mesh: THREE.SkinnedMesh }> {
  const hips = new THREE.Bone();
  hips.name = `${prefix}Hips`;
  const spine = new THREE.Bone();
  spine.name = `${prefix}Spine`;
  spine.position.y = 1;
  hips.add(spine);
  root.add(hips);
  root.updateMatrixWorld(true);

  const mesh = new THREE.SkinnedMesh(skinnedGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = `${prefix}Mesh`;
  mesh.bind(new THREE.Skeleton([hips, spine]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { hips, spine, mesh };
}

describe("Three character preview extension", () => {
  it("rejects a required exact clip index that is absent", () => {
    const root = new THREE.Group();
    const callbacks = previewCallbacks();
    const controller = createThreeCharacterPreviewController(
      { id: "clip-preview", name: "Clip Preview" },
      callbacks,
      { requiredClipIndex: 4 },
    );
    const { context, requestRender, scene } = previewContext(
      root,
      [new THREE.AnimationClip("Idle", 1, [])],
    );

    expect(() => controller.attach(context)).toThrowError("Imported clip 4 is unavailable");
    expect(callbacks.onAnalysis).not.toHaveBeenCalled();
    expect(callbacks.onPlayback).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
    expect(scene.children).toEqual([root]);
    expect(() => controller.dispose()).not.toThrow();
  });

  it("limits an exact rig helper and frame objects to the selected rig", () => {
    const root = new THREE.Group();
    const selected = addRig(root, "Selected");
    const unrelated = addRig(root, "Other");
    stampGltfSubAssetBindings(new Map<object, unknown>([
      [selected.mesh, { nodes: 11 }],
      [unrelated.mesh, { nodes: 12 }],
    ]));
    const controller = createThreeCharacterPreviewController(
      { id: "selected-rig", name: "Selected Rig" },
      previewCallbacks(),
      { skinSourceNodeIndices: [11] },
    );
    const { context, scene } = previewContext(root);

    const attachment = controller.attach(context);
    const helper = scene.getObjectByName("Braze Skeleton Preview") as THREE.SkeletonHelper;
    const handles = scene.getObjectByName("Braze Bone Handles");

    expect(helper.bones.map((bone) => bone.name)).toEqual(["SelectedHips", "SelectedSpine"]);
    expect(helper.bones).not.toContain(unrelated.hips);
    expect(helper.bones).not.toContain(unrelated.spine);
    expect(attachment?.frameObjects).toContain(selected.mesh);
    expect(attachment?.frameObjects).toContain(helper);
    expect(attachment?.frameObjects).toContain(handles);
    expect(attachment?.frameObjects).not.toContain(unrelated.mesh);

    controller.detach();
    expect(helper.parent).toBeNull();
  });

  it("stops a non-looping imported clip at its final pose", () => {
    const root = new THREE.Group();
    const callbacks = previewCallbacks();
    const controller = createThreeCharacterPreviewController(
      { id: "one-shot", name: "One Shot" },
      callbacks,
      { requiredClipIndex: 0, loopingByClipIndex: { 0: false } },
    );
    const { context } = previewContext(root, [new THREE.AnimationClip("Death", 1, [])]);
    controller.attach(context);
    controller.setPlaying(true);

    expect(controller.render!({
      index: 1,
      nowMilliseconds: 1_500,
      deltaSeconds: 1.5,
      unscaledDeltaSeconds: 1.5,
      timeScale: 1,
      elapsedSeconds: 1.5,
      unscaledElapsedSeconds: 1.5,
    })).toBe(false);
    expect(callbacks.onPlayback).toHaveBeenLastCalledWith({
      clipIndex: 0,
      timeSeconds: 1,
      durationSeconds: 1,
      playing: false,
    });
  });

  it("previews an unapplied draft range and updates its loop policy without reattaching", () => {
    const root = new THREE.Group();
    const callbacks = previewCallbacks();
    const source = new THREE.AnimationClip("Take", 2, [
      new THREE.NumberKeyframeTrack(".position[x]", [0, 1, 2], [0, 1, 2]),
    ]);
    const controller = createThreeCharacterPreviewController(
      { id: "draft-preview", name: "Draft Preview" },
      callbacks,
      {
        requiredClipIndex: 0,
        draftClip: {
          sourceIndex: 0,
          firstFrame: 15,
          lastFrame: 45,
          looping: false,
          loopPose: false,
        },
      },
    );
    const { context } = previewContext(root, [source]);
    controller.attach(context);

    expect(callbacks.onPlayback).toHaveBeenLastCalledWith({
      clipIndex: 0,
      timeSeconds: 0,
      durationSeconds: 1,
      playing: false,
    });

    controller.setDraftClip({
      sourceIndex: 0,
      firstFrame: 0,
      lastFrame: 30,
      looping: true,
      loopPose: false,
    });
    controller.setPlaying(true);
    expect(controller.render!({
      index: 1,
      nowMilliseconds: 1_500,
      deltaSeconds: 1.5,
      unscaledDeltaSeconds: 1.5,
      timeScale: 1,
      elapsedSeconds: 1.5,
      unscaledElapsedSeconds: 1.5,
    })).toBe(true);
    expect(callbacks.onPlayback).toHaveBeenLastCalledWith({
      clipIndex: 0,
      timeSeconds: 0.5,
      durationSeconds: 1,
      playing: true,
    });
  });

  it("previews full-take Loop Pose without range metadata or source mutation", () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = "Hips";
    root.add(hips);
    const sourceTrack = new THREE.VectorKeyframeTrack(
      "Hips.position",
      [0, 0.5, 1],
      [
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
      ],
    );
    const source = new THREE.AnimationClip("Take", 1, [sourceTrack]);
    const controller = createThreeCharacterPreviewController(
      { id: "loop-pose-preview", name: "Loop Pose Preview" },
      previewCallbacks(),
      {
        requiredClipIndex: 0,
        draftClip: {
          sourceIndex: 0,
          looping: true,
          loopPose: true,
        },
      },
    );
    const { context } = previewContext(root, [source]);
    controller.attach(context);

    controller.setTime(1);
    expect(hips.position.x).toBeCloseTo(0);
    expect(sourceTrack.values[sourceTrack.values.length - 3]).toBe(2);

    controller.setDraftClip({
      sourceIndex: 0,
      looping: true,
      loopPose: false,
    });
    controller.setTime(1);
    expect(hips.position.x).toBeCloseTo(2);
  });
});
