import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredCharacterDiagnostics,
  configuredSubAssets,
} from "./library-asset-records.mjs";

test("configuredSubAssets merges safe Humanoid authoring facts into detected Avatars", () => {
  const skeleton = {
    localId: "skeleton:hero",
    kind: "skeleton",
    name: "Hero Skeleton",
    compatibilitySignature: "sig-hero",
    bones: [],
  };
  const entries = configuredSubAssets([
    skeleton,
    {
      localId: "avatar:hero",
      kind: "avatar",
      name: "Hero",
      skeletonLocalId: "skeleton:hero",
      bones: [],
    },
    { localId: "clip:idle", kind: "clip", name: "Idle" },
  ], {
    rig: {
      kind: "humanoid",
      rootBoneId: " bone:root ",
      motionRootBoneId: "bone:hips",
      avatarSource: { kind: "createFromModel" },
      humanBoneMapping: { hips: " bone:hips ", ignored: 42 },
    },
  });

  assert.equal(entries[0], skeleton);
  assert.deepEqual(entries[1], {
    localId: "avatar:hero",
    kind: "avatar",
    name: "Hero",
    skeletonLocalId: "skeleton:hero",
    bones: [],
    configuredRigKind: "humanoid",
    configuredAvatarSource: "createFromModel",
    humanBoneMapping: { hips: "bone:hips" },
    humanoidTuning: {
      armStretch: 0.05,
      legStretch: 0.05,
      upperArmTwist: 0.5,
      lowerArmTwist: 0.5,
      upperLegTwist: 0.5,
      lowerLegTwist: 0.5,
      feetSpacing: 0,
      hasTranslationDof: false,
    },
    configuredRootBoneId: "bone:root",
    configuredMotionRootBoneId: "bone:hips",
    inspectorValues: {
      "Animation Type": "Humanoid",
      "Root Bone": "None",
      "Motion Root": "None",
      Definition: "Create From This Model",
      "Human Mapping": "1 bone",
    },
  });
  assert.deepEqual(entries[2], { localId: "clip:idle", kind: "clip", name: "Idle" });
});

test("configuredSubAssets records Generic and None intent without inventing an Avatar", () => {
  const entries = [{ localId: "avatar:hero", kind: "avatar", name: "Hero" }];
  assert.deepEqual(configuredSubAssets(entries, {
    rig: { kind: "generic", rootBoneId: " bone:root " },
  }), [{
    ...entries[0],
    configuredRigKind: "generic",
    configuredRootBoneId: "bone:root",
    inspectorValues: { "Animation Type": "Generic", "Root Bone": "None" },
  }]);
  assert.deepEqual(configuredSubAssets(entries, { rig: { kind: "none" } }), [{
    ...entries[0],
    configuredRigKind: "none",
    inspectorValues: { "Animation Type": "None" },
  }]);
  assert.equal(configuredSubAssets(entries, {}), entries);
});

test("configuredSubAssets retains the exact source reference for copied Avatars", () => {
  const entries = configuredSubAssets([
    { localId: "avatar:target", kind: "avatar", name: "Target" },
  ], {
    rig: {
      kind: "humanoid",
      avatarSource: {
        kind: "copyFromAvatar",
        avatarRef: { guid: "a".repeat(32), localId: "avatar:source" },
      },
      humanBoneMapping: { hips: "bone:hips" },
    },
  });
  assert.deepEqual(entries[0].configuredAvatarRef, {
    guid: "a".repeat(32),
    localId: "avatar:source",
  });
  assert.equal(entries[0].configuredAvatarSource, "copyFromAvatar");
  assert.deepEqual(entries[0].humanBoneMapping, { hips: "bone:hips" });

  const malformed = configuredSubAssets([
    { localId: "avatar:target", kind: "avatar", name: "Target" },
  ], {
    rig: {
      kind: "humanoid",
      avatarSource: { kind: "copyFromAvatar", avatarRef: { guid: "not-a-guid" } },
    },
  });
  assert.equal("configuredAvatarRef" in malformed[0], false);
  assert.equal(malformed[0].configuredAvatarSource, "createFromModel");

  const missingLocalId = configuredSubAssets([
    { localId: "avatar:target", kind: "avatar", name: "Target" },
  ], {
    rig: {
      kind: "humanoid",
      avatarSource: { kind: "copyFromAvatar", avatarRef: { guid: "b".repeat(32) } },
    },
  });
  assert.equal("configuredAvatarRef" in missingLocalId[0], false);
  assert.equal(missingLocalId[0].configuredAvatarSource, "createFromModel");
});

test("configured character diagnostics warn when detected skinning has Rig Type None", () => {
  const avatar = [{ localId: "avatar:hero", kind: "avatar", name: "Hero" }];
  const diagnostics = configuredCharacterDiagnostics([], avatar, { rig: { kind: "none" } });
  assert.deepEqual(diagnostics, [{
    code: "skinned-content-without-rig",
    severity: "warning",
    message: "This model contains skinning, but its Animation Type is None.",
  }]);
  assert.equal(configuredCharacterDiagnostics(diagnostics, avatar, { rig: { kind: "none" } }), diagnostics);
  assert.deepEqual(configuredCharacterDiagnostics([], avatar, { rig: { kind: "generic" } }), []);
});

test("configuredSubAssets retains clip identity while applying import and loop policy", () => {
  const clips = [
    { localId: "clip:Attack", kind: "clip", name: "Attack", looping: true },
    { localId: "clip:Death", kind: "clip", name: "Death", looping: false },
  ];
  const configured = configuredSubAssets(clips, {
    importAnimations: false,
    clipSettings: { "clip:Attack": { looping: false } },
  });

  assert.deepEqual(configured, [
    {
      ...clips[0],
      clipOrigin: "source",
      sourceTakeLocalId: "clip:Attack",
      looping: false,
      importEnabled: false,
      inspectorValues: { "Loop Time": "No", Imported: "No" },
    },
    {
      ...clips[1],
      clipOrigin: "source",
      sourceTakeLocalId: "clip:Death",
      looping: false,
      importEnabled: false,
      inspectorValues: { "Loop Time": "No", Imported: "No" },
    },
  ]);
  assert.deepEqual(configured.map((clip) => clip.localId), clips.map((clip) => clip.localId));
});

test("configuredSubAssets projects importer-authored Clip events without changing identity", () => {
  const source = {
    localId: "clip:Idle",
    kind: "clip",
    name: "Idle",
    durationSeconds: 2,
    events: [{ id: "source", name: "Source", timeSeconds: 0.25, payload: {} }],
  };
  const [configured] = configuredSubAssets([source], {
    importAnimations: true,
    clipSettings: {
      "clip:Idle": {
        looping: true,
        events: [{ id: "step", name: "Footstep", timeSeconds: 3, payload: { foot: "left" } }],
      },
    },
  });

  assert.equal(configured.localId, source.localId);
  assert.deepEqual(configured.events, [
    { id: "step", name: "Footstep", timeSeconds: 2, payload: { foot: "left" } },
  ]);
});

test("configuredSubAssets publishes stable multiple Clip segments from one FBX take", () => {
  const source = {
    localId: "clip:Take",
    kind: "clip",
    name: "Take",
    sourceName: "Take",
    sourceIndex: 0,
    runtimeSegmentBaseIndex: 2,
    frameRate: 30,
    sourceFirstFrame: 0,
    sourceLastFrame: 90,
    sourceDurationSeconds: 3,
    looping: true,
    sourceLooping: true,
  };
  const configured = configuredSubAssets([source], {
    importAnimations: true,
    clipSettings: {
      "clip:segment-b": {
        kind: "segment",
        enabled: true,
        sourceIndex: 0,
        sourceTakeLocalId: "clip:Take",
        name: "Recover",
        firstFrame: 60,
        lastFrame: 90,
        looping: false,
      },
      "clip:segment-a": {
        kind: "segment",
        enabled: true,
        sourceIndex: 0,
        sourceTakeLocalId: "clip:Take",
        name: "Attack",
        firstFrame: 0,
        lastFrame: 30,
        looping: false,
      },
    },
  });

  assert.deepEqual(configured.map((clip) => [
    clip.localId,
    clip.name,
    clip.clipOrigin,
    clip.runtimeClipIndex,
  ]), [
    ["clip:Take", "Take", "source", 0],
    ["clip:segment-a", "Attack", "segment", 2],
    ["clip:segment-b", "Recover", "segment", 3],
  ]);
});

test("configuredSubAssets projects FBX clip rename and frame range without changing identity", () => {
  const source = {
    localId: "clip:mixamo",
    kind: "clip",
    name: "mixamo.com",
    sourceName: "mixamo.com",
    sourceIndex: 0,
    frameRate: 30,
    firstFrame: 0,
    lastFrame: 51,
    sourceFirstFrame: 0,
    sourceLastFrame: 51,
    durationSeconds: 1.7,
    sourceDurationSeconds: 1.7,
    looping: true,
    sourceLooping: true,
    inspectorValues: { Duration: "1.70 s", Start: 0, End: 51 },
  };
  const [configured] = configuredSubAssets([source], {
    importAnimations: true,
    clipSettings: {
      "clip:mixamo": {
        sourceIndex: 0,
        name: "Spinning",
        firstFrame: 6,
        lastFrame: 36,
        looping: false,
      },
    },
  });

  assert.equal(configured.localId, source.localId);
  assert.equal(configured.name, "Spinning");
  assert.equal(configured.firstFrame, 6);
  assert.equal(configured.lastFrame, 36);
  assert.equal(configured.durationSeconds, 1);
  assert.equal(configured.looping, false);
  assert.deepEqual(configured.inspectorValues, {
    Duration: "1.00 s",
    Start: 6,
    End: 36,
    "Loop Time": "No",
    Imported: "Yes",
  });
});
