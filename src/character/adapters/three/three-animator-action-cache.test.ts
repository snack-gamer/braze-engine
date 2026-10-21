import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import { ThreeAnimatorActionCache, type ThreeAnimatorClipResource } from "./three-animator-action-cache";

describe("Three Animator action cache", () => {
  it("fails closed at the per-character action capacity", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const clipsById = new Map();
    const samples = Array.from({ length: 129 }, (_, index) => {
      const id = `clip:${index}`;
      const clip = new THREE.AnimationClip(id, 1, [
        new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 1, 0, 0]),
      ]);
      clipsById.set(id, {
        id,
        resource: { bindings: [{ root: body, clip }] },
        metadata: { durationSeconds: 1, looping: true, events: [] },
      });
      return {
        sampleId: id,
        clipId: id,
        unwrappedLocalTimeSeconds: 0.5,
        localTimeSeconds: 0.5,
        weight: 1 / 129,
      };
    });
    const application: AnimatorPoseApplication<ThreeAnimatorClipResource> = {
      plan: {
        controllerId: "controller",
        controllerRevision: "r1",
        instructions: [{
          layerId: "base",
          blendMode: "override",
          layerWeight: 1,
          gpuMaskIndex: null,
          clips: samples,
        }],
      },
      clipsById,
      masksById: new Map(),
    };
    const cache = new ThreeAnimatorActionCache(body);

    const result = cache.apply(application);
    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("three-animator-action-capacity");
    expect(animated.position.x).toBe(0);

    const recoveryClip = new THREE.AnimationClip("Recovery", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 4, 0, 0]),
    ]);
    const recoveryClips = new Map([["recovery", playbackClip(
      "recovery",
      body,
      recoveryClip,
    )]]);
    const recovery = cache.apply(singleLayerApplication(recoveryClips, [{
      sampleId: "recovery",
      clipId: "recovery",
      unwrappedLocalTimeSeconds: 0.5,
      localTimeSeconds: 0.5,
      weight: 1,
    }]));
    expect(recovery.diagnostics).toEqual([]);
    expect(recovery.value?.changed).toBe(true);
    expect(animated.position.x).toBeCloseTo(2, 6);
    cache.dispose();
    cache.dispose();
  });

  it("preserves authored duration when a track partition ends earlier", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const clip = new THREE.AnimationClip("Long", 2, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["long", {
      id: "long",
      resource: { bindings: [{ root: body, clip }] },
      metadata: { durationSeconds: 2, looping: true, events: [] },
    }]]);
    const cache = new ThreeAnimatorActionCache(body);
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, "clipAction");

    try {
      const result = cache.apply(singleLayerApplication(clipsById, [{
        sampleId: "long",
        clipId: "long",
        unwrappedLocalTimeSeconds: 1.5,
        localTimeSeconds: 1.5,
        weight: 1,
      }]));
      expect(result.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(2, 6);
      expect((clipAction.mock.calls[0]?.[0] as THREE.AnimationClip).duration).toBe(2);
    } finally {
      cache.dispose();
      clipAction.mockRestore();
    }
  });

  it("rolls back partial actions when a later clip is missing", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["move", playbackClip("move", body, clip)]]);
    const cache = new ThreeAnimatorActionCache(body);
    const sample = (sampleId: string, clipId: string) => ({
      sampleId,
      clipId,
      unwrappedLocalTimeSeconds: 0.5,
      localTimeSeconds: 0.5,
      weight: 1,
    });

    const failed = cache.apply(singleLayerApplication(clipsById, [
      sample("move", "move"),
      sample("missing", "missing"),
    ]));
    expect(failed.value).toBeNull();
    expect(failed.diagnostics[0]?.code).toBe("missing-three-animation-clip");
    expect(animated.position.x).toBe(0);

    const empty = cache.apply(singleLayerApplication(clipsById, []));
    expect(empty.diagnostics).toEqual([]);
    expect(animated.position.x).toBe(0);

    const recovered = cache.apply(singleLayerApplication(clipsById, [sample("move", "move")]));
    expect(recovered.diagnostics).toEqual([]);
    expect(animated.position.x).toBeCloseTo(1, 6);
    cache.dispose();
  });

  it("reuses action groups while live layer weights change and applies fresh factors", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const clipsById = new Map([
      ["base", playbackClip("base", body, base)],
      ["upper", playbackClip("upper", body, upper)],
    ]);
    const cache = new ThreeAnimatorActionCache(body);
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, "clipAction");

    try {
      for (let index = 0; index < 320; index += 1) {
        const upperWeight = (index + 1) / 321;
        const result = cache.apply(layeredApplication(clipsById, upperWeight));
        expect(result.diagnostics).toEqual([]);
        expect(result.value?.changed).toBe(true);
        expect(animated.position.x).toBeCloseTo(1 + 4 * upperWeight, 6);
      }
      expect(clipAction).toHaveBeenCalledTimes(2);
    } finally {
      cache.dispose();
      clipAction.mockRestore();
    }
  });

  it("mixes plain and SkeletonUtils bone tracks in one character binding space", () => {
    const body = new THREE.Group();
    const animated = new THREE.Bone();
    animated.name = "Animated";
    const mesh = skinnedMesh("Skin", [animated]);
    body.add(animated, mesh);
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack(".bones[Animated].position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const clipsById = new Map([
      ["base", playbackClip("base", body, base)],
      ["upper", playbackClip("upper", mesh, upper)],
    ]);
    const cache = new ThreeAnimatorActionCache(body);
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, "clipAction");

    try {
      const result = cache.apply(layeredApplication(clipsById, 0.5));
      expect(result.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(3, 6);
      expect(clipAction).toHaveBeenCalledTimes(2);
      expect(clipAction.mock.calls.every((call) => call[1] === body)).toBe(true);
      expect(clipAction.mock.calls.map((call) => (
        (call[0] as THREE.AnimationClip).tracks[0]?.name
      ))).toEqual([
        "Animated.position",
        "Animated.position",
      ]);
      expect(upper.tracks[0]?.name).toBe(".bones[Animated].position");
    } finally {
      cache.dispose();
      clipAction.mockRestore();
      disposeSkinnedMesh(mesh);
    }
  });

  it("blends same-named clips from different source roots at endpoints and midpoint", () => {
    const body = new THREE.Group();
    const animated = new THREE.Bone();
    animated.name = "Animated";
    const mesh = skinnedMesh("Skin", [animated]);
    body.add(animated, mesh);
    const localClip = new THREE.AnimationClip("mixamo.com", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const skeletonClip = new THREE.AnimationClip("mixamo.com", 1, [
      new THREE.VectorKeyframeTrack(
        ".bones[Animated].position",
        [0, 1],
        [0, 0, 0, 10, 0, 0],
      ),
    ]);
    const localId = "local-guid:clip:mixamo.com";
    const skeletonId = "skeleton-guid:clip:mixamo.com";
    const clipsById = new Map([
      [localId, playbackClip(localId, body, localClip)],
      [skeletonId, playbackClip(skeletonId, mesh, skeletonClip)],
    ]);
    const cache = new ThreeAnimatorActionCache(body);
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, "clipAction");
    const sample = (clipId: string, weight: number) => ({
      sampleId: clipId,
      clipId,
      unwrappedLocalTimeSeconds: 0.5,
      localTimeSeconds: 0.5,
      weight,
    });

    try {
      const localEndpoint = cache.apply(singleLayerApplication(clipsById, [
        sample(localId, 1),
      ]));
      expect(localEndpoint.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(1, 6);

      const midpoint = cache.apply(singleLayerApplication(clipsById, [
        sample(localId, 0.5),
        sample(skeletonId, 0.5),
      ]));
      expect(midpoint.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(3, 6);

      const skeletonEndpoint = cache.apply(singleLayerApplication(clipsById, [
        sample(skeletonId, 1),
      ]));
      expect(skeletonEndpoint.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(5, 6);

      const midpointActions = clipAction.mock.calls.slice(1, 3);
      expect(midpointActions.map((call) => (
        (call[0] as THREE.AnimationClip).name
      ))).toEqual(["mixamo.com", "mixamo.com"]);
      expect(midpointActions[0]?.[0]).not.toBe(midpointActions[1]?.[0]);
      expect(midpointActions.every((call) => call[1] === body)).toBe(true);
    } finally {
      cache.dispose();
      clipAction.mockRestore();
      disposeSkinnedMesh(mesh);
    }
  });

  it("deduplicates bindings from distinct Skeleton wrappers over the same bones", () => {
    const body = new THREE.Group();
    const animated = new THREE.Bone();
    animated.name = "Animated";
    const firstSkin = skinnedMesh("FirstSkin", [animated]);
    const secondSkin = skinnedMesh("SecondSkin", [animated]);
    body.add(animated, firstSkin, secondSkin);
    const base = new THREE.AnimationClip("Base", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const upper = new THREE.AnimationClip("Upper", 1, [
      new THREE.VectorKeyframeTrack(".bones[Animated].position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    const clipsById = new Map([
      ["base", playbackClip("base", body, base)],
      ["upper", {
        id: "upper",
        resource: {
          bindings: [
            { root: firstSkin, clip: upper },
            { root: secondSkin, clip: upper },
          ],
        },
        metadata: { durationSeconds: 1, looping: true, events: [] },
      }],
    ]);
    const cache = new ThreeAnimatorActionCache(body);
    const clipAction = vi.spyOn(THREE.AnimationMixer.prototype, "clipAction");

    try {
      const result = cache.apply(layeredApplication(clipsById, 0.5));
      expect(result.diagnostics).toEqual([]);
      expect(animated.position.x).toBeCloseTo(3, 6);
      expect(clipAction).toHaveBeenCalledTimes(2);
    } finally {
      cache.dispose();
      clipAction.mockRestore();
      disposeSkinnedMesh(firstSkin);
      disposeSkinnedMesh(secondSkin);
    }
  });

  it("fails closed when distinct skeleton targets reuse one bone name", () => {
    const body = new THREE.Group();
    const safeTarget = new THREE.Object3D();
    const firstBone = new THREE.Bone();
    const secondBone = new THREE.Bone();
    safeTarget.name = "Safe";
    firstBone.name = "Animated";
    secondBone.name = "Animated";
    const firstSkin = skinnedMesh("FirstSkin", [firstBone]);
    const secondSkin = skinnedMesh("SecondSkin", [secondBone]);
    body.add(safeTarget, firstBone, secondBone, firstSkin, secondSkin);
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack(".bones[Animated].position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["move", {
      id: "move",
      resource: {
        bindings: [
          { root: firstSkin, clip },
          { root: secondSkin, clip },
        ],
      },
      metadata: { durationSeconds: 1, looping: true, events: [] },
    }]]);
    const safeClip = new THREE.AnimationClip("Safe", 1, [
      new THREE.VectorKeyframeTrack("Safe.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const safeClips = new Map([["safe", playbackClip("safe", body, safeClip)]]);
    const allClips = new Map([...safeClips, ...clipsById]);
    const cache = new ThreeAnimatorActionCache(body);

    try {
      const safeSample = {
        sampleId: "safe",
        clipId: "safe",
        unwrappedLocalTimeSeconds: 0.5,
        localTimeSeconds: 0.5,
        weight: 1,
      };
      expect(cache.apply(singleLayerApplication(allClips, [safeSample])).value).not.toBeNull();
      expect(safeTarget.position.x).toBeCloseTo(1, 6);

      const result = cache.apply(singleLayerApplication(allClips, [{
        sampleId: "move",
        clipId: "move",
        unwrappedLocalTimeSeconds: 0.5,
        localTimeSeconds: 0.5,
        weight: 1,
      }]));
      expect(result.value).toBeNull();
      expect(result.diagnostics[0]?.code).toBe("noncanonical-three-animation-binding");
      expect(safeTarget.position.x).toBe(0);

      const recovered = cache.apply(singleLayerApplication(allClips, [safeSample]));
      expect(recovered.diagnostics).toEqual([]);
      expect(safeTarget.position.x).toBeCloseTo(1, 6);
    } finally {
      cache.dispose();
      disposeSkinnedMesh(firstSkin);
      disposeSkinnedMesh(secondSkin);
    }
  });

  it("invalidates rendering when the last active motion restores the saved pose", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["move", playbackClip("move", body, clip)]]);
    const cache = new ThreeAnimatorActionCache(body);

    const active = cache.apply(singleLayerApplication(clipsById, [{
      sampleId: "move",
      clipId: "move",
      unwrappedLocalTimeSeconds: 0.5,
      localTimeSeconds: 0.5,
      weight: 1,
    }]));
    expect(active.value?.changed).toBe(true);
    expect(animated.position.x).toBeCloseTo(1, 6);

    const empty = cache.apply(singleLayerApplication(clipsById, []));
    expect(empty.value?.changed).toBe(true);
    expect(animated.position.x).toBe(0);
    expect(cache.apply(singleLayerApplication(clipsById, [])).value?.changed).toBe(false);
    cache.dispose();
  });

  it("retains omitted properties only while Write Defaults is disabled", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const move = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["move", playbackClip("move", body, move)]]);
    const cache = new ThreeAnimatorActionCache(body);
    const sample = [{
      sampleId: "move",
      clipId: "move",
      unwrappedLocalTimeSeconds: 0.5,
      localTimeSeconds: 0.5,
      weight: 1,
    }];

    cache.apply(writeDefaultsApplication(clipsById, sample, false));
    expect(animated.position.x).toBeCloseTo(1, 6);
    cache.apply(writeDefaultsApplication(clipsById, [], false));
    expect(animated.position.x).toBeCloseTo(1, 6);
    cache.apply(writeDefaultsApplication(clipsById, [], true));
    expect(animated.position.x).toBe(0);
    cache.dispose();
  });
});

function playbackClip(
  id: string,
  root: THREE.Object3D,
  clip: THREE.AnimationClip,
) {
  return {
    id,
    resource: { bindings: [{ root, clip }] },
    metadata: { durationSeconds: 1, looping: true, events: [] },
  };
}

function skinnedMesh(name: string, bones: THREE.Bone[]): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  mesh.bind(new THREE.Skeleton(bones));
  return mesh;
}

function disposeSkinnedMesh(mesh: THREE.SkinnedMesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => material.dispose());
}

function layeredApplication(
  clipsById: AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"],
  upperWeight: number,
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
          clips: [sample("base", "base")],
        },
        {
          layerId: "upper",
          blendMode: "override",
          layerWeight: upperWeight,
          gpuMaskIndex: null,
          clips: [sample("upper", "upper")],
        },
      ],
    },
    clipsById,
    masksById: new Map(),
  };
}

function singleLayerApplication(
  clipsById: AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"],
  clips: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"]["instructions"][number]["clips"],
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  return {
    plan: {
      controllerId: "controller",
      controllerRevision: "r1",
      instructions: [{
        layerId: "base",
        blendMode: "override",
        layerWeight: 1,
        gpuMaskIndex: null,
        clips,
      }],
    },
    clipsById,
    masksById: new Map(),
  };
}

function writeDefaultsApplication(
  clipsById: AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"],
  clips: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"]["instructions"][number]["clips"],
  writeDefaults: boolean,
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  const application = singleLayerApplication(clipsById, clips);
  return {
    ...application,
    plan: {
      ...application.plan,
      instructions: application.plan.instructions.map((instruction) => ({
        ...instruction,
        writeDefaults,
      })),
    },
  };
}
