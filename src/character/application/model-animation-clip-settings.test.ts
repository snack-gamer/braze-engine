import { describe, expect, it } from "vitest";
import {
  addModelAnimationClipSettings,
  modelAnimationClipSettings,
  modelAnimationClipSources,
  modelAnimationClipLooping,
  removeModelAnimationClipSettings,
  setModelAnimationClipSettings,
  setModelAnimationClipLooping,
} from "./model-animation-clip-settings";

describe("model animation clip settings", () => {
  it("uses the imported source policy until an exact-local-ID override exists", () => {
    const settings = { clipSettings: { "clip:Attack": { looping: false } } };
    expect(modelAnimationClipLooping(settings, "clip:Attack", true)).toBe(false);
    expect(modelAnimationClipLooping(settings, "clip:Idle", true)).toBe(true);
    expect(modelAnimationClipLooping(settings, "clip:Death", false)).toBe(false);
  });

  it("updates one clip without mutating or discarding other clip settings", () => {
    const settings = { clipSettings: { "clip:Idle": { looping: true } } };
    const patch = setModelAnimationClipLooping(settings, "clip:Attack", false);
    expect(patch.clipSettings).toEqual({
      "clip:Idle": { looping: true },
      "clip:Attack": { looping: false },
    });
    expect(settings.clipSettings).toEqual({ "clip:Idle": { looping: true } });
  });

  it("decodes FBX source timing and authors a clamped runtime-addressable range", () => {
    const source = modelAnimationClipSources([{
      kind: "clip",
      localId: "clip:Spin",
      name: "Spin",
      sourceName: "mixamo.com",
      sourceIndex: 0,
      frameRate: 30,
      sourceFirstFrame: 0,
      sourceLastFrame: 51,
      looping: true,
    }])[0]!;
    const settings = { clipSettings: {} };
    const patch = setModelAnimationClipSettings(settings, source, {
      name: "Spinning",
      firstFrame: 12,
      lastFrame: 100,
      looping: false,
    });

    expect(patch.clipSettings).toEqual({
      "clip:Spin": {
        kind: "source",
        enabled: true,
        sourceIndex: 0,
        sourceTakeLocalId: "clip:Spin",
        name: "Spinning",
        firstFrame: 12,
        lastFrame: 51,
        looping: false,
      },
    });
    expect(modelAnimationClipSettings(patch, source)).toEqual({
      name: "Spinning",
      looping: false,
      loopPose: false,
      firstFrame: 12,
      lastFrame: 51,
    });
  });

  it("retains authored animation events when clip import properties change", () => {
    const source = modelAnimationClipSources([{
      kind: "clip",
      localId: "clip:Spin",
      name: "Spin",
      sourceIndex: 0,
      frameRate: 30,
      firstFrame: 0,
      lastFrame: 51,
      looping: true,
    }])[0]!;
    const events = [{
      id: "animation-event-footstep",
      name: "Footstep",
      timeSeconds: 0.5,
      payload: {},
    }];
    const settings = {
      clipSettings: {
        "clip:Spin": { looping: true, events },
      },
    };

    const patch = setModelAnimationClipSettings(settings, source, { looping: false });
    const cleared = setModelAnimationClipSettings({
      clipSettings: { "clip:Spin": { looping: true, events: [] } },
    }, source, { looping: false });

    expect(patch.clipSettings["clip:Spin"]?.events).toEqual(events);
    expect(cleared.clipSettings["clip:Spin"]?.events).toEqual([]);
    expect(settings.clipSettings["clip:Spin"].events).toEqual(events);
  });

  it("authors many stable segments from one take and tombstones removals", () => {
    const subAssets = [{
      kind: "model",
      localId: "main",
      name: "Hero",
      animationTakes: [{
        localId: "clip:Take",
        name: "Take 001",
        sourceIndex: 0,
        frameRate: 30,
        firstFrame: 0,
        lastFrame: 90,
        looping: true,
      }],
    }];
    const take = modelAnimationClipSources([{
      kind: "clip",
      localId: "clip:Take",
      name: "Take 001",
      sourceIndex: 0,
      frameRate: 30,
      firstFrame: 0,
      lastFrame: 90,
      looping: true,
    }])[0]!;
    const added = addModelAnimationClipSettings(
      { clipSettings: {} },
      take,
      "clip:segment-a",
      "Attack",
    );
    const visible = modelAnimationClipSources(subAssets, added);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      localId: "clip:segment-a",
      origin: "segment",
      sourceTakeLocalId: "clip:Take",
      runtimeClipIndex: null,
    });

    const removed = removeModelAnimationClipSettings(added, visible[0]!);
    expect(removed.clipSettings["clip:segment-a"]).toMatchObject({ enabled: false });
    expect(modelAnimationClipSources(subAssets, removed)).toEqual([]);
  });
});
