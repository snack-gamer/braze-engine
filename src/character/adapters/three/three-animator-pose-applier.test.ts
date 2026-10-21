import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import { HUMANOID_BODY_PARTS } from "../../domain/avatar-mask";
import { boneId } from "../../domain/skeleton";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import { createThreeAnimatorPoseBackend } from "./three-animator-pose-applier";

function target() {
  const sceneNode = new THREE.Group();
  sceneNode.position.set(2, 0, 0);
  const body = new THREE.Group();
  const animated = new THREE.Object3D();
  animated.name = "Animated";
  body.add(animated);
  sceneNode.add(body);
  const clip = new THREE.AnimationClip("Move", 1, [
    new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const resource: ThreeAnimatorClipResource = { bindings: [{ root: body, clip }] };
  return { sceneNode, body, animated, resource };
}

function application(
  resource: ThreeAnimatorClipResource,
  masksById = new Map(),
  clips = [{ clipId: "model:clip", localTimeSeconds: 0.5, weight: 1 }],
  avatar?: AnimatorPlaybackAvatar,
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  const runtimeClips = clips.map((clip, index) => ({
    sampleId: `sample-${index}`,
    unwrappedLocalTimeSeconds: clip.localTimeSeconds,
    ...clip,
  }));
  return {
    plan: {
      controllerId: "controller",
      controllerRevision: "r1",
      instructions: [{
        layerId: "base",
        blendMode: "override",
        layerWeight: 1,
        gpuMaskIndex: masksById.size > 0 ? 0 : null,
        clips: runtimeClips,
      }],
    },
    clipsById: new Map([[
      "model:clip",
      {
        id: "model:clip",
        resource,
        metadata: { durationSeconds: 1, looping: true, events: [] },
      },
    ]]),
    masksById,
    ...(avatar ? { avatar } : {}),
  };
}

describe("Three Animator pose backend", () => {
  it("samples a plan without a private clock and restores authored state on disposal", () => {
    const { sceneNode, body, animated, resource } = target();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    expect(backend.pose.applyPose(application(resource)).value?.changed).toBe(true);
    expect(animated.position.x).toBeCloseTo(0.5, 6);
    backend.rootMotionSink.applyRootMotion({
      characterId: "hero",
      fixedDeltaSeconds: 1 / 60,
      delta: { translation: [1, 0, 0], rotation: [0, 0, 0, 1] },
    });
    expect(sceneNode.position.x).toBeCloseTo(3, 6);

    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
    expect(animated.position.x).toBe(0);
    expect(sceneNode.position.x).toBe(2);
  });

  it("filters tracks through a transform mask before caching the action", () => {
    const { sceneNode, body, animated, resource } = target();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;
    const masks = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "Other Bone",
        revision: "r1",
        humanoidBodyParts: {},
        transforms: [{ path: "Other", active: true }],
      },
    ]]);

    backend.pose.applyPose(application(resource, masks));
    expect(animated.position.x).toBe(0);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("keeps a generic mask with no transform entries full-body", () => {
    const { sceneNode, body, animated, resource } = target();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;
    const masks = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "Empty",
        revision: "r1",
        humanoidBodyParts: {},
        transforms: [],
      },
    ]]);

    backend.pose.applyPose(application(resource, masks));
    expect(animated.position.x).toBeCloseTo(0.5, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("treats omitted humanoid parts as active and all-explicit-false as inactive", () => {
    const first = target();
    const defaultBackend = createThreeAnimatorPoseBackend(first.sceneNode, first.body).value!;
    const avatar = humanoidAvatar();
    const defaultMask = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "Default",
        revision: "r1",
        humanoidBodyParts: {},
        transforms: [],
      },
    ]]);
    defaultBackend.pose.applyPose(application(first.resource, defaultMask, undefined, avatar));
    expect(first.animated.position.x).toBeCloseTo(0.5, 6);
    defaultBackend.pose.restoreAuthoredPose();
    defaultBackend.pose.dispose();

    const second = target();
    const inactiveBackend = createThreeAnimatorPoseBackend(second.sceneNode, second.body).value!;
    const inactiveMask = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "None",
        revision: "r1",
        humanoidBodyParts: Object.fromEntries(HUMANOID_BODY_PARTS.map((part) => [part, false])),
        transforms: [],
      },
    ]]);
    inactiveBackend.pose.applyPose(application(second.resource, inactiveMask, undefined, avatar));
    expect(second.animated.position.x).toBe(0);
    inactiveBackend.pose.restoreAuthoredPose();
    inactiveBackend.pose.dispose();
  });

  it("resolves durable mask bone IDs before path fallbacks", () => {
    const { sceneNode, body, animated, resource } = target();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;
    const id = boneId("bone:Animated");
    const avatar: AnimatorPlaybackAvatar = {
      id: "model:avatar",
      kind: "generic",
      skeleton: {
        version: 1,
        id: "skeleton",
        name: "Skeleton",
        rootBoneIds: [id],
        compatibilitySignature: "signature",
        bones: [{
          id,
          name: "Animated",
          path: "Animated",
          parentId: null,
          bindLocal: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        }],
      },
    };
    const masks = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "Stable",
        revision: "r1",
        humanoidBodyParts: {},
        transforms: [{ boneId: id, path: "Old/Readable/Path", active: true }],
      },
    ]]);

    backend.pose.applyPose(application(resource, masks, undefined, avatar));
    expect(animated.position.x).toBeCloseTo(0.5, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("keeps duplicate clip samples in independent stable action slots", () => {
    const { sceneNode, body, animated, resource } = target();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;
    backend.pose.applyPose(application(resource, new Map(), [
      { clipId: "model:clip", localTimeSeconds: 0.2, weight: 0.5 },
      { clipId: "model:clip", localTimeSeconds: 0.8, weight: 0.5 },
    ]));
    expect(animated.position.x).toBeCloseTo(0.5, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("applies ordered override layers instead of globally averaging them", () => {
    const { sceneNode, body, animated } = target();
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    backend.pose.applyPose(layeredApplication(body, base, upper, 1));
    expect(animated.position.x).toBeCloseTo(5, 6);
    backend.pose.applyPose(layeredApplication(body, base, upper, 0.25));
    expect(animated.position.x).toBeCloseTo(2, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("does not attenuate lower tracks beneath an empty higher override", () => {
    const { sceneNode, body, animated } = target();
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const empty = new THREE.AnimationClip("Empty", 1, []);
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    backend.pose.applyPose(layeredApplication(body, base, empty, 0.75));
    expect(animated.position.x).toBeCloseTo(1, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("keeps a lower Leg track when an unmasked higher clip only animates Arm", () => {
    const sceneNode = new THREE.Group();
    const body = new THREE.Group();
    const arm = new THREE.Object3D();
    const leg = new THREE.Object3D();
    arm.name = "Arm";
    leg.name = "Leg";
    body.add(arm, leg);
    sceneNode.add(body);
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Arm.position", [0, 1], [0, 0, 0, 2, 0, 0]),
      new THREE.VectorKeyframeTrack("Leg.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack("Arm.position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    backend.pose.applyPose(layeredApplication(body, base, upper, 1));
    expect(arm.position.x).toBeCloseTo(5, 6);
    expect(leg.position.x).toBeCloseTo(1, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("attenuates lower layers only where a higher override mask is active", () => {
    const sceneNode = new THREE.Group();
    const body = new THREE.Group();
    const arm = new THREE.Object3D();
    const leg = new THREE.Object3D();
    arm.name = "Arm";
    leg.name = "Leg";
    body.add(arm, leg);
    sceneNode.add(body);
    const tracks = (end: number) => [
      new THREE.VectorKeyframeTrack("Arm.position", [0, 1], [0, 0, 0, end, 0, 0]),
      new THREE.VectorKeyframeTrack("Leg.position", [0, 1], [0, 0, 0, end, 0, 0]),
    ];
    const masks = new Map([[
      "mask:main",
      {
        version: 1 as const,
        id: "mask",
        name: "Arm only",
        revision: "r1",
        humanoidBodyParts: {},
        transforms: [{ path: "Arm", active: true }],
      },
    ]]);
    const application = layeredApplication(
      body,
      new THREE.AnimationClip("Base", 1, tracks(2)),
      new THREE.AnimationClip("Upper", 1, tracks(10)),
      1,
      masks,
    );
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    backend.pose.applyPose(application);
    expect(arm.position.x).toBeCloseTo(5, 6);
    expect(leg.position.x).toBeCloseTo(1, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("attenuates a lower additive layer beneath a partial higher override", () => {
    const { sceneNode, body, animated } = target();
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const additive = new THREE.AnimationClip("Lean", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 4, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const backend = createThreeAnimatorPoseBackend(sceneNode, body).value!;

    backend.pose.applyPose(additiveLayerApplication(body, base, additive, upper, 0.5, 0.25));
    // ((base 1) + (additive 2 * 0.5)) * 0.75 + (upper 5 * 0.25)
    expect(animated.position.x).toBeCloseTo(2.75, 6);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
  });

  it("uses the viewport frustum as well as hierarchy visibility for culling", () => {
    const sceneNode = new THREE.Group();
    const body = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    body.add(new THREE.Mesh(geometry, material));
    sceneNode.add(body);
    sceneNode.position.z = -5;
    sceneNode.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    const backend = createThreeAnimatorPoseBackend(sceneNode, body, camera).value!;

    expect(backend.pose.isVisible()).toBe(true);
    sceneNode.position.x = 100;
    sceneNode.updateMatrixWorld(true);
    expect(backend.pose.isVisible()).toBe(false);
    body.visible = false;
    expect(backend.pose.isVisible()).toBe(false);
    backend.pose.restoreAuthoredPose();
    backend.pose.dispose();
    geometry.dispose();
    material.dispose();
  });
});

function layeredApplication(
  body: THREE.Object3D,
  base: THREE.AnimationClip,
  upper: THREE.AnimationClip,
  upperWeight: number,
  masksById = new Map(),
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  const sample = (sampleId: string, clipId: string) => ({
    sampleId,
    clipId,
    unwrappedLocalTimeSeconds: 0.5,
    localTimeSeconds: 0.5,
    weight: 1,
  });
  return {
    plan: {
      controllerId: "controller",
      controllerRevision: "r1",
      instructions: [
        {
          layerId: "base",
          blendMode: "override",
          layerWeight: 1,
          gpuMaskIndex: null,
          clips: [sample("base", "base:clip")],
        },
        {
          layerId: "upper",
          blendMode: "override",
          layerWeight: upperWeight,
          gpuMaskIndex: masksById.size > 0 ? 0 : null,
          clips: [sample("upper", "upper:clip")],
        },
      ],
    },
    clipsById: new Map([
      ["base:clip", {
        id: "base:clip",
        resource: { bindings: [{ root: body, clip: base }] },
        metadata: { durationSeconds: 1, looping: true, events: [] },
      }],
      ["upper:clip", {
        id: "upper:clip",
        resource: { bindings: [{ root: body, clip: upper }] },
        metadata: { durationSeconds: 1, looping: true, events: [] },
      }],
    ]),
    masksById,
  };
}

function additiveLayerApplication(
  body: THREE.Object3D,
  base: THREE.AnimationClip,
  additive: THREE.AnimationClip,
  upper: THREE.AnimationClip,
  additiveWeight: number,
  upperWeight: number,
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  const sample = (sampleId: string, clipId: string) => ({
    sampleId,
    clipId,
    unwrappedLocalTimeSeconds: 0.5,
    localTimeSeconds: 0.5,
    weight: 1,
  });
  const clip = (id: string, resource: THREE.AnimationClip) => ({
    id,
    resource: { bindings: [{ root: body, clip: resource }] },
    metadata: { durationSeconds: 1, looping: true, events: [] },
  });
  return {
    plan: {
      controllerId: "controller",
      controllerRevision: "r1",
      instructions: [
        {
          layerId: "base",
          blendMode: "override",
          layerWeight: 1,
          gpuMaskIndex: null,
          clips: [sample("base", "base:clip")],
        },
        {
          layerId: "additive",
          blendMode: "additive",
          layerWeight: additiveWeight,
          gpuMaskIndex: null,
          clips: [sample("additive", "additive:clip")],
        },
        {
          layerId: "upper",
          blendMode: "override",
          layerWeight: upperWeight,
          gpuMaskIndex: null,
          clips: [sample("upper", "upper:clip")],
        },
      ],
    },
    clipsById: new Map([
      ["base:clip", clip("base:clip", base)],
      ["additive:clip", clip("additive:clip", additive)],
      ["upper:clip", clip("upper:clip", upper)],
    ]),
    masksById: new Map(),
  };
}

function humanoidAvatar(): AnimatorPlaybackAvatar {
  const id = boneId("bone:Animated");
  const skeleton = {
    version: 1 as const,
    id: "skeleton",
    name: "Skeleton",
    rootBoneIds: [id],
    compatibilitySignature: "signature",
    bones: [{
      id,
      name: "Animated",
      path: "Animated",
      parentId: null,
      bindLocal: { translation: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
      inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
    }],
  };
  return {
    id: "model:avatar",
    kind: "humanoid",
    skeleton,
    definition: {
      version: 1,
      id: "avatar",
      name: "Avatar",
      revision: "r1",
      sourceRef: { guid: "a".repeat(32), localId: "avatar" },
      skeletonRef: { guid: "a".repeat(32), localId: "skeleton" },
      mapping: { hips: id },
      referencePose: { space: "skeletonLocal", bones: {} },
      humanScale: 1,
      forwardAxis: "+z",
      upAxis: "+y",
      tuning: {
        armStretch: 0.05,
        legStretch: 0.05,
        upperArmTwist: 0.5,
        lowerArmTwist: 0.5,
        upperLegTwist: 0.5,
        lowerLegTwist: 0.5,
        feetSpacing: 0,
        hasTranslationDof: false,
      },
      validation: { status: "valid", issues: [] },
    },
  };
}
