import { describe, expect, it } from "vitest";
import {
  defaultModelImportSettings,
  isModelAnimationSourcePreviewUrl,
  modelAnimationSourcePreviewUrl,
  normalizeModelImportSettings,
} from "./model-import-settings";

describe("model import settings", () => {
  it("migrates legacy blend-shape settings without opting static assets into a rig", () => {
    const settings = normalizeModelImportSettings({ importBlendShapes: false });

    expect(settings.rig).toEqual({
      kind: "none",
      importBlendShapes: false,
      maxBoneInfluences: 4,
      optimizeBones: false,
    });
  });

  it("marks source-only animation preview URLs without losing existing query or fragments", () => {
    const url = modelAnimationSourcePreviewUrl("/3d-models/Hero.fbx?importVersion=7#take");
    expect(url).toBe("/3d-models/Hero.fbx?importVersion=7&animationSourcePreview=1#take");
    expect(isModelAnimationSourcePreviewUrl(url)).toBe(true);
    expect(isModelAnimationSourcePreviewUrl("/3d-models/Hero.fbx")).toBe(false);
  });

  it("normalizes segment ownership and stable removal tombstones", () => {
    const settings = normalizeModelImportSettings({
      clipSettings: {
        "clip:segment-a": {
          kind: "segment",
          enabled: false,
          sourceIndex: 2,
          sourceTakeLocalId: " clip:Take ",
          firstFrame: 5,
          lastFrame: 25,
          looping: true,
          loopPose: true,
        },
      },
    });
    expect(settings.clipSettings["clip:segment-a"]).toEqual({
      kind: "segment",
      enabled: false,
      sourceIndex: 2,
      sourceTakeLocalId: "clip:Take",
      firstFrame: 5,
      lastFrame: 25,
      looping: true,
      loopPose: true,
    });
  });

  it("normalizes a Humanoid configuration as the single rig settings owner", () => {
    const settings = normalizeModelImportSettings({
      rig: {
        kind: "humanoid",
        importBlendShapes: true,
        maxBoneInfluences: 2,
        optimizeBones: false,
        avatarSource: { kind: "createFromModel" },
        humanBoneMapping: { hips: "bone:hips", head: "bone:head" },
      },
    });

    expect(settings.rig).toMatchObject({
      kind: "humanoid",
      maxBoneInfluences: 2,
      avatarSource: { kind: "createFromModel" },
      humanBoneMapping: { hips: "bone:hips", head: "bone:head" },
    });
    expect("importBlendShapes" in settings).toBe(false);
  });

  it("keeps the default migration semantically inert", () => {
    expect(defaultModelImportSettings.rig.kind).toBe("none");
    expect(defaultModelImportSettings.clipSettings).toEqual({});
  });

  it("normalizes bounded per-clip looping overrides by stable local ID", () => {
    const settings = normalizeModelImportSettings({
      clipSettings: {
        " clip:Attack ": { looping: false, futureField: "preserved elsewhere" },
        "clip:Idle": { looping: true, loopPose: true },
        "clip:Invalid": { looping: "false" },
        "": { looping: false },
      },
    });

    expect(settings.clipSettings).toEqual({
      "clip:Attack": { looping: false },
      "clip:Idle": { looping: true, loopPose: true },
    });
  });

  it("normalizes an atomic Unity-style source frame range without trusting malformed timing", () => {
    const settings = normalizeModelImportSettings({
      clipSettings: {
        "clip:Spin": {
          sourceIndex: 2,
          name: "  Spinning Fast  ",
          firstFrame: 10,
          lastFrame: 40,
          looping: false,
        },
        "clip:Broken": {
          sourceIndex: 0,
          firstFrame: 30,
          lastFrame: 10,
          looping: true,
        },
      },
    });

    expect(settings.clipSettings).toEqual({
      "clip:Broken": { sourceIndex: 0, looping: true },
      "clip:Spin": {
        sourceIndex: 2,
        name: "Spinning Fast",
        firstFrame: 10,
        lastFrame: 40,
        looping: false,
      },
    });
  });

  it("normalizes bounded animation events inside their stable clip setting", () => {
    const settings = normalizeModelImportSettings({
      clipSettings: {
        "clip:Idle": {
          looping: true,
          events: [
            {
              id: " step ",
              name: " Footstep ",
              timeSeconds: 0.75,
              payload: { foot: "left", speed: 2, active: true, empty: null, nested: {} },
            },
            { id: "step", name: "Duplicate", timeSeconds: 1, payload: {} },
            { id: "bad", name: "", timeSeconds: -1, payload: {} },
          ],
        },
      },
    });

    expect(settings.clipSettings["clip:Idle"]?.events).toEqual([{
      id: "step",
      name: "Footstep",
      timeSeconds: 0.75,
      payload: { foot: "left", speed: 2, active: true, empty: null },
    }]);
  });
});
