import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSupportedModelImportSettingsVersion,
  mergePreservedModelImportSettings,
  normalizeModelImportSettings,
  normalizeStoredModelImportSettings,
} from "./model-imports.mjs";

test("model importer refuses unknown future settings versions", () => {
  assert.doesNotThrow(() => assertSupportedModelImportSettingsVersion(undefined));
  assert.doesNotThrow(() => assertSupportedModelImportSettingsVersion(2));
  assert.doesNotThrow(() => assertSupportedModelImportSettingsVersion(3));
  assert.throws(
    () => assertSupportedModelImportSettingsVersion(4),
    /Unsupported model import settings version 4/,
  );
});

test("model importer migrates the legacy blend-shape field into an inert rig", () => {
  const settings = normalizeModelImportSettings({ importBlendShapes: false });
  assert.deepEqual(settings.rig, {
    kind: "none",
    importBlendShapes: false,
    maxBoneInfluences: 4,
    optimizeBones: false,
  });
  assert.equal("importBlendShapes" in settings, false);
});

test("model importer validates humanoid mappings and copied Avatar references", () => {
  const settings = normalizeModelImportSettings({
    rig: {
      kind: "humanoid",
      maxBoneInfluences: 2,
      avatarSource: {
        kind: "copyFromAvatar",
        avatarRef: { guid: "ABCDEF0123456789ABCDEF0123456789", localId: "avatar:human" },
      },
      humanBoneMapping: { hips: "bone:hips", inventedSlot: "bone:ignored", ignored: 42 },
      humanoid_tuning: { arm_stretch: 2, lower_leg_twist: -1, feet_spacing: -4, has_translation_dof: true },
      motionRootBoneId: "  bone:motion  ",
    },
  });
  assert.deepEqual(settings.rig.avatarSource, {
    kind: "copyFromAvatar",
    avatarRef: { guid: "abcdef0123456789abcdef0123456789", localId: "avatar:human" },
  });
  assert.deepEqual(settings.rig.humanBoneMapping, { hips: "bone:hips" });
  assert.deepEqual(settings.rig.humanoidTuning, {
    armStretch: 1,
    legStretch: 0.05,
    upperArmTwist: 0.5,
    lowerArmTwist: 0.5,
    upperLegTwist: 0.5,
    lowerLegTwist: 0,
    feetSpacing: -1,
    hasTranslationDof: true,
  });
  assert.equal(settings.rig.motionRootBoneId, "bone:motion");
});

test("model importer requires copied Avatars to identify an exact subasset", () => {
  const missingLocalId = normalizeModelImportSettings({
    rig: {
      kind: "humanoid",
      avatarSource: {
        kind: "copyFromAvatar",
        avatarRef: { guid: "a".repeat(32) },
      },
    },
  });
  assert.deepEqual(missingLocalId.rig.avatarSource, { kind: "createFromModel" });
});

test("model importer preserves valid Generic motion roots and strips invalid rig roots", () => {
  const generic = normalizeModelImportSettings({
    rig: {
      kind: "generic",
      rootBoneId: "  bone:root  ",
      motionRootBoneId: "  bone:motion  ",
    },
  });
  assert.equal(generic.rig.rootBoneId, "bone:root");
  assert.equal(generic.rig.motionRootBoneId, "bone:motion");

  const invalid = normalizeModelImportSettings({
    rig: { kind: "generic", rootBoneId: 42, motionRootBoneId: "   " },
  });
  assert.equal("rootBoneId" in invalid.rig, false);
  assert.equal("motionRootBoneId" in invalid.rig, false);

  const inert = normalizeModelImportSettings({
    rig: { kind: "none", motionRootBoneId: "bone:ignored" },
  });
  assert.equal("motionRootBoneId" in inert.rig, false);
});

test("nested rig settings override a stale legacy blend-shape field", () => {
  const normalized = normalizeModelImportSettings({
    importBlendShapes: false,
    rig: {
      kind: "generic",
      importBlendShapes: true,
      maxBoneInfluences: 4,
      optimizeBones: false,
    },
  });
  assert.equal(normalized.rig.importBlendShapes, true);
});

test("stored v1 settings migrate before v2 defaults are applied", () => {
  const normalized = normalizeStoredModelImportSettings(
    { importBlendShapes: false, animationType: "generic", rootBone: "bone:root" },
    {},
  );
  assert.deepEqual(normalized.rig, {
    kind: "generic",
    importBlendShapes: false,
    maxBoneInfluences: 4,
    optimizeBones: false,
    rootBoneId: "bone:root",
  });
});

test("model importer normalizes bounded clip looping overrides by stable local ID", () => {
  const settings = normalizeModelImportSettings({
    clipSettings: {
      " clip:Attack ": { looping: false, ignored: true },
      "clip:Idle": { looping: true, loopPose: true },
      "clip:Invalid": { looping: "false" },
      "": { looping: false },
    },
  });
  assert.deepEqual(settings.clipSettings, {
    "clip:Attack": { looping: false },
    "clip:Idle": { looping: true, loopPose: true },
  });
});

test("model importer v3 normalizes source take identity, name, and frame range atomically", () => {
  const settings = normalizeModelImportSettings({
    clipSettings: {
      "clip:Spin": {
        sourceIndex: 0,
        name: "  Spinning Fast  ",
        firstFrame: 10,
        lastFrame: 40,
        looping: false,
      },
      "clip:Broken": {
        sourceIndex: 1,
        firstFrame: 40,
        lastFrame: 10,
        looping: true,
      },
    },
  });
  assert.deepEqual(settings.clipSettings, {
    "clip:Broken": { sourceIndex: 1, looping: true },
    "clip:Spin": {
      sourceIndex: 0,
      name: "Spinning Fast",
      firstFrame: 10,
      lastFrame: 40,
      looping: false,
    },
  });
});

test("model importer v3 retains stable segment ownership and removal tombstones", () => {
  const settings = normalizeModelImportSettings({
    clipSettings: {
      "clip:segment-a": {
        kind: "segment",
        enabled: false,
        sourceIndex: 0,
        sourceTakeLocalId: " clip:Take ",
        firstFrame: 4,
        lastFrame: 24,
        looping: false,
      },
    },
  });
  assert.deepEqual(settings.clipSettings["clip:segment-a"], {
    kind: "segment",
    enabled: false,
    sourceIndex: 0,
    sourceTakeLocalId: "clip:Take",
    firstFrame: 4,
    lastFrame: 24,
    looping: false,
  });
});

test("model importer normalizes clip animation events and payload values", () => {
  const settings = normalizeModelImportSettings({
    clipSettings: {
      "clip:Idle": {
        looping: true,
        events: [
          {
            id: " step ",
            name: " Footstep ",
            timeSeconds: 0.5,
            payload: { foot: "left", speed: 2, active: true, empty: null, nested: {} },
          },
          { id: "step", name: "Duplicate", timeSeconds: 1, payload: {} },
          { id: "bad", name: "", timeSeconds: 1, payload: {} },
        ],
      },
    },
  });

  assert.deepEqual(settings.clipSettings["clip:Idle"].events, [{
    id: "step",
    name: "Footstep",
    timeSeconds: 0.5,
    payload: { foot: "left", speed: 2, active: true, empty: null },
  }]);
});

test("model importer preserves unknown settings while normalizing owned fields", () => {
  const merged = mergePreservedModelImportSettings({
    futureTopLevel: { retained: true },
    rig: {
      kind: "humanoid",
      futureRigField: 42,
      avatarSource: { kind: "createFromModel", futureSourceField: "keep" },
      humanBoneMapping: { hips: "old", futureHumanSlot: "future-bone" },
    },
    clipSettings: {
      "clip:Attack": { looping: true, futureClipField: "keep" },
      "clip:FutureOnly": { futureClipField: "keep" },
    },
  }, {
    rig: {
      kind: "humanoid",
      avatarSource: { kind: "createFromModel" },
      humanBoneMapping: { hips: "bone:hips", inventedSlot: "discard" },
    },
    clipSettings: { "clip:Attack": { looping: false } },
  });

  assert.deepEqual(merged.futureTopLevel, { retained: true });
  assert.equal(merged.rig.futureRigField, 42);
  assert.equal(merged.rig.avatarSource.futureSourceField, "keep");
  assert.deepEqual(merged.rig.humanBoneMapping, { hips: "bone:hips" });
  assert.deepEqual(merged.clipSettings, {
    "clip:Attack": { looping: false, futureClipField: "keep" },
    "clip:FutureOnly": { futureClipField: "keep" },
  });
});
