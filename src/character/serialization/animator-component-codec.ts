import {
  createDefaultAnimatorComponent,
  normalizeRootMotionPolicy,
  type AnimatorComponent,
} from "../domain/animator-component";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type { AnimatorParameterOverride } from "../domain/animator-parameters";
import {
  acceptDocumentVersion,
  arrayWithinLimit,
  assertArrayWithinLimit,
  documentRecord,
  optionalString,
  parseAssetRef,
  preservedDocumentFields,
  record,
  serializeAssetRef,
} from "./character-codec-values";
import { decodeAnimatorController, encodeAnimatorController } from "./animator-controller-codec";

export const ANIMATOR_COMPONENT_FORMAT = "braze/animator-component-v2";

const ANIMATOR_COMPONENT_FIELDS = [
  "version", "enabled", "controller", "controllerRef", "controller_ref", "avatarRef", "avatar_ref",
  "rootMotion", "root_motion", "updateMode", "update_mode", "cullingMode", "culling_mode",
  "parameterOverrides", "parameter_overrides",
] as const;

function decodeOverrides(value: unknown): AnimatorParameterOverride[] {
  const byParameter = new Map<string, AnimatorParameterOverride>();
  for (const item of arrayWithinLimit(
    value,
    "parameterOverrides",
    ANIMATOR_DOCUMENT_LIMITS.parameterOverridesPerComponent,
  )) {
    const input = record(item);
    const parameterId = optionalString(input?.parameterId ?? input?.parameter_id);
    const overrideValue = input?.value;
    if (!parameterId || (typeof overrideValue !== "number" && typeof overrideValue !== "boolean")) continue;
    if (typeof overrideValue === "number" && !Number.isFinite(overrideValue)) continue;
    byParameter.set(parameterId, { parameterId, value: overrideValue });
  }
  return [...byParameter.values()];
}

export function decodeAnimatorComponent(value: unknown): AnimatorComponent {
  if (value === undefined || value === null) {
    return createDefaultAnimatorComponent();
  }
  const input = documentRecord(value, "animator");
  acceptDocumentVersion(input, ANIMATOR_COMPONENT_FORMAT, [
    "braze/animator-component-v1",
    "braze/animator-component-v0",
  ]);
  const controller = record(input.controller)
    ? decodeAnimatorController(input.controller)
    : undefined;
  const controllerRef = parseAssetRef(input.controllerRef ?? input.controller_ref, "controllerRef");
  const avatarRef = parseAssetRef(input.avatarRef ?? input.avatar_ref, "avatarRef");
  const rawRootMotion = record(input.rootMotion ?? input.root_motion) ?? {};
  const rootMotion = normalizeRootMotionPolicy({
    mode: rawRootMotion.mode,
    source: rawRootMotion.source,
    translationAxes: rawRootMotion.translationAxes ?? rawRootMotion.translation_axes,
    rotation: rawRootMotion.rotation,
    bakeIntoPose: rawRootMotion.bakeIntoPose ?? rawRootMotion.bake_into_pose,
  });
  const extensions = preservedDocumentFields(input, ANIMATOR_COMPONENT_FIELDS);
  return {
    version: 1,
    enabled: input.enabled !== false,
    ...(controller ? { controller } : {}),
    ...(controllerRef ? { controllerRef } : {}),
    ...(avatarRef ? { avatarRef } : {}),
    rootMotion,
    updateMode: input.updateMode === "unscaledTime" || input.updateMode === "fixedStep"
      ? input.updateMode
      : input.update_mode === "unscaledTime" || input.update_mode === "fixedStep"
        ? input.update_mode
        : "normal",
    cullingMode: input.cullingMode === "alwaysAnimate" || input.culling_mode === "alwaysAnimate"
      ? "alwaysAnimate"
      : "basedOnRenderVisibility",
    parameterOverrides: decodeOverrides(input.parameterOverrides ?? input.parameter_overrides),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export function encodeAnimatorComponent(value: AnimatorComponent) {
  assertArrayWithinLimit(
    value.parameterOverrides,
    "parameterOverrides",
    ANIMATOR_DOCUMENT_LIMITS.parameterOverridesPerComponent,
  );
  return {
    ...(value.extensions ?? {}),
    version: ANIMATOR_COMPONENT_FORMAT,
    enabled: value.enabled,
    ...(value.controller ? { controller: encodeAnimatorController(value.controller) } : {}),
    ...(value.controllerRef ? { controllerRef: serializeAssetRef(value.controllerRef) } : {}),
    ...(value.avatarRef ? { avatarRef: serializeAssetRef(value.avatarRef) } : {}),
    rootMotion: {
      ...value.rootMotion,
      translationAxes: { ...value.rootMotion.translationAxes },
    },
    updateMode: value.updateMode,
    cullingMode: value.cullingMode,
    parameterOverrides: value.parameterOverrides.map((override) => ({ ...override })),
  };
}
