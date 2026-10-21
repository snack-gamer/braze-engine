import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { AnimationDocument } from "../animation/types";
import type { SceneObject } from "../types";
import type { AssetCache, LoadedAsset } from "./assets";
import { disposeRuntimeMotionMixers, syncMotionClipAnimation } from "./animation";
import { markSceneDirty, type Runtime } from "./runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function animatedObject(): SceneObject {
  return {
    id: "actor",
    name: "Actor",
    primitive: "gltf",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function animationDocument(): AnimationDocument {
  return {
    version: 1,
    duration: 2,
    fps: 30,
    playhead: 0.5,
    loop: false,
    motionSources: [{
      id: "motion-source",
      objectId: "actor",
      sourceUrl: "/motions/run.glb",
      sourceType: "gltf",
      name: "Run",
      duration: 2,
      trackCount: 1,
      clipIndex: 0,
      retarget: false,
    }],
    tracks: [{
      id: "motion-track",
      kind: "motionClip",
      objectId: "actor",
      label: "Run",
      enabled: true,
      clips: [{
        id: "clip",
        sourceId: "motion-source",
        name: "Run",
        start: 0,
        duration: 2,
        offset: 0,
        weight: 1,
        retarget: false,
      }],
    }],
  };
}

describe("motion runtime lifetime", () => {
  it("ignores a motion source that resolves after its viewport session is disposed", async () => {
    const load = deferred<LoadedAsset>();
    const release = vi.fn();
    const cache: AssetCache = {
      acquire: () => ({ value: load.promise, release }),
      dispose: vi.fn(),
    };
    const requestFrame = vi.fn();
    const runtime = {
      disposed: false,
      assetCache: cache,
      motionMixers: new Map(),
      editorPosePreviewObjectIds: new Set(),
      requestFrame,
      framesSinceSceneChange: 3,
    } as unknown as Runtime;
    const body = new THREE.Group();
    new THREE.Group().add(body);

    syncMotionClipAnimation(runtime, animatedObject(), body, animationDocument());
    runtime.disposed = true;
    load.resolve({ object: new THREE.Group(), animations: [new THREE.AnimationClip("Run", 2, [])] });
    await load.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.motionMixers.size).toBe(0);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(body.userData.importedMotionClips).toEqual({});
  });

  it("stops and uncaches every mixer exactly once during teardown", () => {
    const target = new THREE.Group();
    const mixer = new THREE.AnimationMixer(target);
    const stop = vi.spyOn(mixer, "stopAllAction");
    const uncache = vi.spyOn(mixer, "uncacheRoot");
    const runtime = {
      disposed: false,
      motionMixers: new Map([["actor", { target, mixer, action: null, sourceId: "source" }]]),
      editorPosePreviewObjectIds: new Set(),
    } as unknown as Runtime;

    disposeRuntimeMotionMixers(runtime);
    disposeRuntimeMotionMixers(runtime);

    expect(stop).toHaveBeenCalledOnce();
    expect(uncache).toHaveBeenCalledOnce();
    expect(runtime.motionMixers.size).toBe(0);
  });

  it("gives a manually sampled editor preview exclusive ownership of the pose", () => {
    const acquire = vi.fn();
    const target = new THREE.Group();
    const mixer = new THREE.AnimationMixer(target);
    const runtime = {
      disposed: false,
      assetCache: { acquire, dispose: vi.fn() },
      motionMixers: new Map([["actor", { target, mixer, action: null, sourceId: "source" }]]),
      editorPosePreviewObjectIds: new Set(["actor"]),
    } as unknown as Runtime;

    syncMotionClipAnimation(runtime, animatedObject(), target, animationDocument());

    expect(runtime.motionMixers.size).toBe(0);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("does not schedule dirty work on a disposed runtime", () => {
    const requestFrame = vi.fn();
    const runtime = { disposed: true, framesSinceSceneChange: 3, requestFrame } as unknown as Runtime;
    markSceneDirty(runtime);
    expect(runtime.framesSinceSceneChange).toBe(3);
    expect(requestFrame).not.toHaveBeenCalled();
  });
});
