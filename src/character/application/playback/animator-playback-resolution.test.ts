import { describe, expect, it, vi } from "vitest";
import type { AnimatorComponent } from "../../domain/animator-component";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import { resolveAnimatorPlaybackAssets } from "./animator-playback-resolution";

const CONTROLLER_GUID = "a".repeat(32);
const MODEL_GUID = "b".repeat(32);
const MASK_GUID = "c".repeat(32);

function library(): CharacterAssetLibrary {
  return {
    version: 1,
    extensions: {},
    animatorControllers: [{
      version: 1,
      id: CONTROLLER_GUID,
      name: "Locomotion",
      revision: "r1",
      parameters: [],
      layers: [{
        id: "base",
        name: "Base",
        weight: 1,
        blendingMode: "override",
        avatarMaskRef: { guid: MASK_GUID, localId: "main" },
        ikPass: false,
        defaultStateId: "idle",
        anyStateTransitions: [],
        states: [{
          id: "idle",
          name: "Idle",
          motion: {
            kind: "clip",
            clipRef: { guid: MODEL_GUID, localId: "clip:Idle" },
            speed: 1,
          },
          speed: 1,
          cycleOffset: 0,
          mirror: false,
          footIk: false,
          writeDefaults: true,
          transitions: [],
          events: [],
        }],
      }],
    }],
    avatarMasks: [{
      version: 1,
      id: MASK_GUID,
      name: "Upper Body",
      revision: "r1",
      humanoidBodyParts: { leftArm: true, rightArm: true },
      transforms: [],
    }],
  };
}

function component(): AnimatorComponent {
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

describe("resolveAnimatorPlaybackAssets", () => {
  it("resolves controller, unique clips, and masks from durable references", () => {
    const resolveClip = vi.fn((reference) => ({
      value: {
        id: `${reference.guid}:${reference.localId}`,
        resource: "clip",
        metadata: { durationSeconds: 1, looping: true, events: [] },
      },
      diagnostics: [],
    }));
    const resolved = resolveAnimatorPlaybackAssets(component(), library(), { resolveClip });

    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.value?.controller.id).toBe(CONTROLLER_GUID);
    expect(resolved.value?.clips.map((clip) => clip.id)).toEqual([
      `${MODEL_GUID}:clip:Idle`,
    ]);
    expect(resolved.value?.masks.map((mask) => mask.id)).toEqual([MASK_GUID]);
    expect(resolveClip).toHaveBeenCalledOnce();
  });

  it("resolves clips owned by nested state-machine leaves", () => {
    const source = library();
    source.animatorControllers[0]!.layers[0]!.stateMachines = [{
      id: "action",
      name: "Action",
      defaultStateId: "wave",
      states: [{
        ...source.animatorControllers[0]!.layers[0]!.states[0]!,
        id: "wave",
        name: "Wave",
        motion: {
          kind: "clip",
          clipRef: { guid: MODEL_GUID, localId: "clip:Wave" },
          speed: 1,
        },
      }],
      stateMachines: [],
      anyStateTransitions: [],
      transitions: [],
    }];
    const resolved = resolveAnimatorPlaybackAssets(component(), source, {
      resolveClip: (reference) => ({
        value: {
          id: `${reference.guid}:${reference.localId}`,
          resource: "clip",
          metadata: { durationSeconds: 1, looping: true, events: [] },
        },
        diagnostics: [],
      }),
    });

    expect(resolved.value?.clips.map((clip) => clip.id)).toEqual([
      `${MODEL_GUID}:clip:Idle`,
      `${MODEL_GUID}:clip:Wave`,
    ]);
  });

  it("plays an embedded controller without a Project controller asset", () => {
    const source = library();
    const embedded = source.animatorControllers[0]!;
    const resolved = resolveAnimatorPlaybackAssets({
      ...component(),
      controllerRef: undefined,
      controller: embedded,
    }, { ...source, animatorControllers: [] }, {
      resolveClip: (reference) => ({
        value: {
          id: `${reference.guid}:${reference.localId}`,
          resource: "clip",
          metadata: { durationSeconds: 1, looping: true, events: [] },
        },
        diagnostics: [],
      }),
    });

    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.value?.controller.name).toBe("Locomotion");
    expect(resolved.value?.masks.map((mask) => mask.id)).toEqual([MASK_GUID]);
  });

  it("reports thrown and mismatched resolutions without leaking exceptions", () => {
    const thrown = resolveAnimatorPlaybackAssets(component(), library(), {
      resolveClip: () => { throw new Error("asset index unavailable"); },
    });
    expect(thrown.value).toBeNull();
    expect(thrown.diagnostics[0]?.code).toBe("clip-resolution-failed");

    const mismatched = resolveAnimatorPlaybackAssets(component(), library(), {
      resolveClip: () => ({
        value: {
          id: `${MODEL_GUID}:clip:Wrong`,
          resource: "clip",
          metadata: { durationSeconds: 1, looping: true, events: [] },
        },
        diagnostics: [],
      }),
    });
    expect(mismatched.value).toBeNull();
    expect(mismatched.diagnostics.map((item) => item.code)).toContain("mismatched-animation-clip");
  });
});
