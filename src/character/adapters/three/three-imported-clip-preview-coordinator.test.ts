import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SceneObject } from "../../../scene/domain/scene-object";
import { emitRuntimeBodyLifecycle } from "../../../three/reconciliation/body-lifecycle";
import type { Runtime } from "../../../three/runtime";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { AnimatorPlaybackClip } from "../../application/playback/animator-playback-contracts";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import { ThreeImportedClipPreviewCoordinator } from "./three-imported-clip-preview-coordinator";

const MODEL_GUID = "a".repeat(32);
const CLIP_GUID = "b".repeat(32);
const clipRef = { guid: CLIP_GUID, localId: "clip:idle" };

function sceneObject(id = "hero"): SceneObject {
  return {
    id,
    name: "Hero",
    primitive: "gltf",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetRef: { guid: MODEL_GUID, localId: "main" },
  };
}

function runtimeWithBody(body: THREE.Object3D) {
  const node = new THREE.Group();
  node.userData.sceneObjectNode = true;
  node.userData.objectId = "hero";
  node.userData.bodyKind = "asset";
  node.add(body);
  const invalidateShadowCasterTransform = vi.fn();
  const runtime = {
    disposed: false,
    objectMap: new Map([["hero", node]]),
    motionMixers: new Map(),
    editorPosePreviewObjectIds: new Set<string>(),
    framesSinceSceneChange: 3,
    invalidateShadowCasterTransform,
    requestFrame: vi.fn(),
  } as unknown as Runtime;
  return { invalidateShadowCasterTransform, runtime, node };
}

function resolvedClip(root: THREE.Object3D) {
  const clip = new THREE.AnimationClip("Move", 1, [
    new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  return characterRuntimeSuccess<AnimatorPlaybackClip<ThreeAnimatorClipResource>>({
    id: `${CLIP_GUID}:clip:idle`,
    resource: { bindings: [{ root, clip }] },
    metadata: { durationSeconds: 1, looping: true, events: [] },
  });
}

describe("Three imported clip preview coordinator", () => {
  it("samples the selected Scene body and restores it when cleared", async () => {
    const body = new THREE.Group();
    body.position.x = 3;
    const { runtime } = runtimeWithBody(body);
    const statuses: string[] = [];
    const coordinator = new ThreeImportedClipPreviewCoordinator({
      runtime,
      resolveClip: async () => resolvedClip(body),
      onStatus: (status) => statuses.push(status.state),
    });

    coordinator.setTarget(sceneObject());
    coordinator.setSample({ clipRef, timeSeconds: 0.5 });
    await Promise.resolve();

    expect(body.position.x).toBeCloseTo(0.5);
    expect(runtime.editorPosePreviewObjectIds.has("hero")).toBe(true);
    expect(statuses).toContain("ready");

    coordinator.setSample(null);
    expect(body.position.x).toBe(3);
    expect(runtime.editorPosePreviewObjectIds.has("hero")).toBe(false);
    coordinator.dispose();
  });

  it("invalidates the selected shadow caster after sampling and restoring its pose", async () => {
    const body = new THREE.Group();
    body.position.x = 3;
    const { invalidateShadowCasterTransform, runtime } = runtimeWithBody(body);
    const coordinator = new ThreeImportedClipPreviewCoordinator({
      runtime,
      resolveClip: async () => resolvedClip(body),
    });

    coordinator.setTarget(sceneObject());
    coordinator.setSample({ clipRef, timeSeconds: 0.25 });
    await Promise.resolve();
    expect(invalidateShadowCasterTransform).toHaveBeenNthCalledWith(1, "hero");

    coordinator.setSample({ clipRef, timeSeconds: 0.75 });
    expect(invalidateShadowCasterTransform).toHaveBeenNthCalledWith(2, "hero");

    coordinator.setSample(null);
    expect(body.position.x).toBe(3);
    expect(invalidateShadowCasterTransform).toHaveBeenNthCalledWith(3, "hero");
    coordinator.dispose();
  });

  it("ignores stale resolution after the target body starts changing", async () => {
    const body = new THREE.Group();
    const { runtime, node } = runtimeWithBody(body);
    let finish!: (value: CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>) => void;
    const pending = new Promise<CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>>(
      (resolve) => { finish = resolve; },
    );
    const coordinator = new ThreeImportedClipPreviewCoordinator({
      runtime,
      resolveClip: async () => pending,
    });
    coordinator.setTarget(sceneObject());
    coordinator.setSample({ clipRef, timeSeconds: 0.5 });

    emitRuntimeBodyLifecycle(runtime, {
      phase: "willChange",
      objectId: "hero",
      node,
      previousBody: body,
      nextBody: null,
      nextKind: "placeholder",
    });
    finish(resolvedClip(body));
    await pending;
    await Promise.resolve();

    expect(body.position.x).toBe(0);
    coordinator.dispose();
  });

  it("restores the previous character before previewing a newly selected one", async () => {
    const firstBody = new THREE.Group();
    firstBody.position.x = 2;
    const secondBody = new THREE.Group();
    secondBody.position.x = 4;
    const { runtime } = runtimeWithBody(firstBody);
    const secondNode = new THREE.Group();
    secondNode.userData.sceneObjectNode = true;
    secondNode.userData.objectId = "ally";
    secondNode.userData.bodyKind = "asset";
    secondNode.add(secondBody);
    runtime.objectMap.set("ally", secondNode);
    const coordinator = new ThreeImportedClipPreviewCoordinator({
      runtime,
      resolveClip: async (_target, body) => resolvedClip(body),
    });
    coordinator.setTarget(sceneObject());
    coordinator.setSample({ clipRef, timeSeconds: 0.5 });
    await Promise.resolve();
    expect(firstBody.position.x).toBeCloseTo(0.5);

    coordinator.setTarget(sceneObject("ally"));
    await Promise.resolve();

    expect(firstBody.position.x).toBe(2);
    expect(secondBody.position.x).toBeCloseTo(0.5);
    expect(runtime.editorPosePreviewObjectIds).toEqual(new Set(["ally"]));
    coordinator.dispose();
    expect(secondBody.position.x).toBe(4);
  });

  it("does not retry an unavailable clip on every playhead sample", async () => {
    const body = new THREE.Group();
    const { runtime } = runtimeWithBody(body);
    const resolveClip = vi.fn(async () => characterRuntimeFailure(
      "incompatible-animation-rig-kinds",
      "The rigs are incompatible.",
    ));
    const coordinator = new ThreeImportedClipPreviewCoordinator({ runtime, resolveClip });
    coordinator.setTarget(sceneObject());
    coordinator.setSample({ clipRef, timeSeconds: 0.1 });
    await Promise.resolve();
    coordinator.setSample({ clipRef, timeSeconds: 0.2 });
    coordinator.setSample({ clipRef, timeSeconds: 0.3 });

    expect(resolveClip).toHaveBeenCalledOnce();
    coordinator.dispose();
  });
});
