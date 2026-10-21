const HUMANOID_BONE_NAMES = new Set([
  "hips",
  "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot",
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm",
  "leftLowerArm", "rightLowerArm", "leftHand", "rightHand",
  "leftToes", "rightToes", "leftEye", "rightEye", "jaw",
  "leftThumbProximal", "leftThumbIntermediate", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbProximal", "rightThumbIntermediate", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
]);

const DEFAULT_HUMANOID_TUNING = {
  armStretch: 0.05,
  legStretch: 0.05,
  upperArmTwist: 0.5,
  lowerArmTwist: 0.5,
  upperLegTwist: 0.5,
  lowerLegTwist: 0.5,
  feetSpacing: 0,
  hasTranslationDof: false,
};

const DEFAULT_SETTINGS = {
  scaleFactor: 1,
  fitToEditorSize: true,
  convertUnits: true,
  sourceUnit: "centimeter",
  bakeAxisConversion: false,
  rig: {
    kind: "none",
    importBlendShapes: true,
    maxBoneInfluences: 4,
    optimizeBones: false,
  },
  importVisibility: true,
  importCameras: false,
  importLights: false,
  preserveHierarchy: true,
  sortHierarchyByName: true,
  meshCompression: "off",
  readWrite: false,
  optimizeMesh: "polygonOrder",
  generateColliders: false,
  normals: "import",
  normalCalculationMode: "areaAndAngleWeighted",
  smoothnessSource: "fromAngle",
  smoothingAngle: 60,
  importMaterials: true,
  materialMode: "preserve",
  importAnimations: true,
  clipSettings: {},
  resampleCurves: true,
  animationCompression: "off",
};

const MODEL_SETTING_KEYS = new Set([
  ...Object.keys(DEFAULT_SETTINGS),
  "animationType", "rigType", "rootBone", "importBlendShapes",
]);
const RIG_SETTING_KEYS = new Set([
  "kind", "importBlendShapes", "maxBoneInfluences", "optimizeBones",
  "rootBoneId", "motionRootBoneId", "avatarSource", "humanBoneMapping",
  "humanoidTuning",
  "import_blend_shapes", "max_bone_influences", "optimize_bones",
  "root_bone_id", "motion_root_bone_id", "avatar_source", "human_bone_mapping", "humanoid_tuning",
]);
const AVATAR_SOURCE_KEYS = new Set(["kind", "avatarRef", "avatar_ref"]);
const CLIP_SETTING_KEYS = new Set([
  "kind", "enabled", "looping", "loopPose", "sourceIndex", "sourceTakeLocalId",
  "name", "firstFrame", "lastFrame", "events",
]);
const MAX_CLIP_SETTINGS = 1_024;
const MAX_CLIP_SOURCE_INDEX = 1_023;
const MAX_CLIP_FRAME = 1_000_000;
const MAX_CLIP_NAME_LENGTH = 120;
const MAX_CLIP_LOCAL_ID_LENGTH = 240;
const MAX_ANIMATION_EVENTS = 256;
const MAX_ANIMATION_EVENT_PAYLOAD_ENTRIES = 32;
const MAX_ANIMATION_EVENT_ID_LENGTH = 240;
const MAX_ANIMATION_EVENT_NAME_LENGTH = 120;
const MAX_ANIMATION_EVENT_PAYLOAD_KEY_LENGTH = 120;
const MAX_ANIMATION_EVENT_PAYLOAD_TEXT_LENGTH = 4_096;
export const MODEL_IMPORT_SETTINGS_VERSION = 3;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function option(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function bounded(value, fallback, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value, fallback)));
}

function normalizeHumanoidTuning(value) {
  const input = record(value);
  return {
    armStretch: bounded(input.armStretch ?? input.arm_stretch, DEFAULT_HUMANOID_TUNING.armStretch, 0, 1),
    legStretch: bounded(input.legStretch ?? input.leg_stretch, DEFAULT_HUMANOID_TUNING.legStretch, 0, 1),
    upperArmTwist: bounded(input.upperArmTwist ?? input.upper_arm_twist, DEFAULT_HUMANOID_TUNING.upperArmTwist, 0, 1),
    lowerArmTwist: bounded(input.lowerArmTwist ?? input.lower_arm_twist, DEFAULT_HUMANOID_TUNING.lowerArmTwist, 0, 1),
    upperLegTwist: bounded(input.upperLegTwist ?? input.upper_leg_twist, DEFAULT_HUMANOID_TUNING.upperLegTwist, 0, 1),
    lowerLegTwist: bounded(input.lowerLegTwist ?? input.lower_leg_twist, DEFAULT_HUMANOID_TUNING.lowerLegTwist, 0, 1),
    feetSpacing: bounded(input.feetSpacing ?? input.feet_spacing, DEFAULT_HUMANOID_TUNING.feetSpacing, -1, 1),
    hasTranslationDof: (input.hasTranslationDof ?? input.has_translation_dof) === true,
  };
}

function fieldsOutside(input, known) {
  return Object.fromEntries(Object.entries(record(input)).filter(([key]) => !known.has(key)));
}

export function assertSupportedModelImportSettingsVersion(value) {
  if (Number(value) > MODEL_IMPORT_SETTINGS_VERSION) {
    throw new Error(`Unsupported model import settings version ${String(value)}`);
  }
}

function normalizeClipSettings(value) {
  return Object.fromEntries(
    Object.entries(record(value))
      .flatMap(([rawLocalId, rawSettings]) => {
        const localId = rawLocalId.trim();
        const settings = record(rawSettings);
        if (!localId || typeof settings.looping !== "boolean") return [];
        const sourceIndex = typeof settings.sourceIndex === "number" ? settings.sourceIndex : Number.NaN;
        const firstFrame = typeof settings.firstFrame === "number" ? settings.firstFrame : Number.NaN;
        const lastFrame = typeof settings.lastFrame === "number" ? settings.lastFrame : Number.NaN;
        const hasValidSourceIndex = Number.isInteger(sourceIndex)
          && sourceIndex >= 0
          && sourceIndex <= MAX_CLIP_SOURCE_INDEX;
        const hasValidRange = hasValidSourceIndex
          && Number.isFinite(firstFrame)
          && firstFrame >= 0
          && firstFrame <= MAX_CLIP_FRAME
          && Number.isFinite(lastFrame)
          && lastFrame > firstFrame
          && lastFrame <= MAX_CLIP_FRAME;
        const name = typeof settings.name === "string"
          ? settings.name.trim().slice(0, MAX_CLIP_NAME_LENGTH)
          : "";
        const sourceTakeLocalId = typeof settings.sourceTakeLocalId === "string"
          ? settings.sourceTakeLocalId.trim().slice(0, MAX_CLIP_LOCAL_ID_LENGTH)
          : "";
        const kind = settings.kind === "source" || settings.kind === "segment"
          ? settings.kind
          : undefined;
        const hasEvents = Array.isArray(settings.events);
        return [[localId, {
          looping: settings.looping,
          ...(typeof settings.loopPose === "boolean" ? { loopPose: settings.loopPose } : {}),
          ...(kind ? { kind } : {}),
          ...(typeof settings.enabled === "boolean" ? { enabled: settings.enabled } : {}),
          ...(hasValidSourceIndex ? { sourceIndex } : {}),
          ...(hasValidSourceIndex && sourceTakeLocalId ? { sourceTakeLocalId } : {}),
          ...(hasValidRange ? { firstFrame, lastFrame } : {}),
          ...(name ? { name } : {}),
          ...(hasEvents ? { events: normalizeAnimationEvents(settings.events) } : {}),
        }]];
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_CLIP_SETTINGS),
  );
}

function normalizeAnimationEvents(value) {
  const seen = new Set();
  return value.flatMap((rawEvent) => {
    const event = record(rawEvent);
    const id = typeof event.id === "string"
      ? event.id.trim().slice(0, MAX_ANIMATION_EVENT_ID_LENGTH)
      : "";
    const name = typeof event.name === "string"
      ? event.name.trim().slice(0, MAX_ANIMATION_EVENT_NAME_LENGTH)
      : "";
    const timeSeconds = typeof event.timeSeconds === "number" && Number.isFinite(event.timeSeconds)
      ? Math.max(0, event.timeSeconds)
      : Number.NaN;
    if (!id || seen.has(id) || !name || !Number.isFinite(timeSeconds)) return [];
    seen.add(id);
    return [{
      id,
      name,
      timeSeconds,
      payload: Object.fromEntries(Object.entries(record(event.payload)).flatMap(([rawKey, item]) => {
        const key = rawKey.trim().slice(0, MAX_ANIMATION_EVENT_PAYLOAD_KEY_LENGTH);
        if (!key) return [];
        if (item === null || typeof item === "boolean") return [[key, item]];
        if (typeof item === "number" && Number.isFinite(item)) return [[key, item]];
        if (typeof item === "string") {
          return [[key, item.slice(0, MAX_ANIMATION_EVENT_PAYLOAD_TEXT_LENGTH)]];
        }
        return [];
      }).slice(0, MAX_ANIMATION_EVENT_PAYLOAD_ENTRIES)),
    }];
  }).sort((left, right) => left.timeSeconds - right.timeSeconds)
    .slice(0, MAX_ANIMATION_EVENTS);
}

export function normalizeRigSettings(value, legacy = {}) {
  const input = record(value);
  const blendShapeValue = Object.hasOwn(input, "importBlendShapes")
    ? input.importBlendShapes
    : legacy.importBlendShapes;
  const shared = {
    importBlendShapes: blendShapeValue !== false,
    maxBoneInfluences: [1, 2, 4].includes(input.maxBoneInfluences) ? input.maxBoneInfluences : 4,
    optimizeBones: input.optimizeBones === true,
  };
  const rootBoneId = typeof input.rootBoneId === "string" && input.rootBoneId.trim()
    ? input.rootBoneId.trim()
    : undefined;
  const motionRootBoneId = typeof input.motionRootBoneId === "string"
    && input.motionRootBoneId.trim()
    ? input.motionRootBoneId.trim()
    : undefined;
  if (input.kind === "generic") {
    return {
      ...shared,
      kind: "generic",
      ...(rootBoneId ? { rootBoneId } : {}),
      ...(motionRootBoneId ? { motionRootBoneId } : {}),
    };
  }
  if (input.kind === "humanoid") {
    const avatarSource = record(input.avatarSource);
    const avatarRef = record(avatarSource.avatarRef);
    const copied = avatarSource.kind === "copyFromAvatar"
      && typeof avatarRef.guid === "string"
      && /^[a-f0-9]{32}$/i.test(avatarRef.guid.trim())
      && typeof avatarRef.localId === "string"
      && avatarRef.localId.trim();
    return {
      ...shared,
      kind: "humanoid",
      ...(rootBoneId ? { rootBoneId } : {}),
      ...(motionRootBoneId ? { motionRootBoneId } : {}),
      avatarSource: copied
        ? {
            kind: "copyFromAvatar",
            avatarRef: {
              guid: avatarRef.guid.trim().toLowerCase(),
              ...(typeof avatarRef.localId === "string" && avatarRef.localId.trim()
                ? { localId: avatarRef.localId.trim() }
                : {}),
            },
          }
        : { kind: "createFromModel" },
      humanBoneMapping: Object.fromEntries(
        Object.entries(record(input.humanBoneMapping))
          .filter(([name, boneId]) => (
            HUMANOID_BONE_NAMES.has(name)
            && typeof boneId === "string"
            && boneId.trim()
          ))
          .map(([name, boneId]) => [name, boneId.trim()]),
      ),
      humanoidTuning: normalizeHumanoidTuning(input.humanoidTuning ?? input.humanoid_tuning),
    };
  }
  return { ...shared, kind: "none" };
}

/** Server-side validation mirrors the client boundary and strips unknown keys. */
export function normalizeModelImportSettings(value) {
  const input = record(value);
  const rigInput = input.rig ?? {
    kind: input.rigType ?? input.animationType ?? "none",
    importBlendShapes: input.importBlendShapes,
    rootBoneId: input.rootBone,
  };
  return {
    scaleFactor: Math.max(0.0001, finite(input.scaleFactor, DEFAULT_SETTINGS.scaleFactor)),
    fitToEditorSize: input.fitToEditorSize !== false,
    convertUnits: input.convertUnits !== false,
    sourceUnit: option(input.sourceUnit, ["centimeter", "meter"], DEFAULT_SETTINGS.sourceUnit),
    bakeAxisConversion: input.bakeAxisConversion === true,
    rig: normalizeRigSettings(rigInput, input),
    importVisibility: input.importVisibility !== false,
    importCameras: input.importCameras === true,
    importLights: input.importLights === true,
    preserveHierarchy: input.preserveHierarchy !== false,
    sortHierarchyByName: input.sortHierarchyByName !== false,
    meshCompression: option(input.meshCompression, ["off", "low", "medium", "high"], DEFAULT_SETTINGS.meshCompression),
    readWrite: input.readWrite === true,
    optimizeMesh: option(input.optimizeMesh, ["none", "polygonOrder"], DEFAULT_SETTINGS.optimizeMesh),
    generateColliders: input.generateColliders === true,
    normals: option(input.normals, ["import", "calculate"], DEFAULT_SETTINGS.normals),
    normalCalculationMode: option(
      input.normalCalculationMode,
      ["unweighted", "areaWeighted", "angleWeighted", "areaAndAngleWeighted"],
      DEFAULT_SETTINGS.normalCalculationMode,
    ),
    smoothnessSource: option(input.smoothnessSource, ["fromAngle", "none"], DEFAULT_SETTINGS.smoothnessSource),
    smoothingAngle: Math.max(0, Math.min(180, finite(input.smoothingAngle, DEFAULT_SETTINGS.smoothingAngle))),
    importMaterials: input.importMaterials !== false,
    materialMode: option(input.materialMode, ["preserve", "import"], DEFAULT_SETTINGS.materialMode),
    importAnimations: input.importAnimations !== false,
    clipSettings: normalizeClipSettings(input.clipSettings),
    resampleCurves: input.resampleCurves !== false,
    animationCompression: option(
      input.animationCompression,
      ["off", "keyframeReduction"],
      DEFAULT_SETTINGS.animationCompression,
    ),
  };
}

function preservedClipSettings(existing, incoming, normalized) {
  const previous = record(existing);
  const requested = record(incoming);
  const localIds = new Set([
    ...Object.keys(previous),
    ...Object.keys(requested),
    ...Object.keys(normalized),
  ]);
  return Object.fromEntries([...localIds].sort().flatMap((localId) => {
    const known = normalized[localId];
    const extension = {
      ...fieldsOutside(previous[localId], CLIP_SETTING_KEYS),
      ...fieldsOutside(requested[localId], CLIP_SETTING_KEYS),
    };
    if (!known && Object.keys(extension).length === 0) return [];
    return [[localId, { ...extension, ...(known ?? {}) }]];
  }));
}

/** Keeps unknown same-version importer fields without letting them override normalized semantics. */
export function mergePreservedModelImportSettings(existing, incoming) {
  const previous = record(existing);
  const requested = record(incoming);
  const normalized = normalizeModelImportSettings(requested);
  const previousRig = record(previous.rig);
  const requestedRig = record(requested.rig);
  const normalizedRig = normalized.rig;
  const rig = {
    ...fieldsOutside(previousRig, RIG_SETTING_KEYS),
    ...fieldsOutside(requestedRig, RIG_SETTING_KEYS),
    ...normalizedRig,
  };
  if (normalizedRig.kind === "humanoid") {
    const previousSource = record(previousRig.avatarSource ?? previousRig.avatar_source);
    const requestedSource = record(requestedRig.avatarSource ?? requestedRig.avatar_source);
    rig.avatarSource = {
      ...fieldsOutside(previousSource, AVATAR_SOURCE_KEYS),
      ...fieldsOutside(requestedSource, AVATAR_SOURCE_KEYS),
      ...normalizedRig.avatarSource,
    };
    // Human slots are a closed semantic vocabulary in this settings version;
    // preserving misspellings here would make invalid mappings look authored.
    rig.humanBoneMapping = normalizedRig.humanBoneMapping;
  }
  return {
    ...fieldsOutside(previous, MODEL_SETTING_KEYS),
    ...fieldsOutside(requested, MODEL_SETTING_KEYS),
    ...normalized,
    rig,
    clipSettings: preservedClipSettings(
      previous.clipSettings,
      requested.clipSettings,
      normalized.clipSettings,
    ),
  };
}

/** Applies persisted precedence before defaults so legacy fields are not hidden by v2 defaults. */
export function normalizeStoredModelImportSettings(legacySettings, importerSettings) {
  return normalizeModelImportSettings({
    ...record(legacySettings),
    ...record(importerSettings),
  });
}
