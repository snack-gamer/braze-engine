import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterDocumentExtensions } from "./character-document";
import type { AnimatorParameterOverride } from "./animator-parameters";
import { createAnimatorController, type AnimatorController } from "./animator-controller";

export type RootMotionMode = "disabled" | "applyToObject" | "extractOnly";

export type RootMotionPolicy = {
  mode: RootMotionMode;
  source: "clip" | "rootBone" | "hips";
  translationAxes: { x: boolean; y: boolean; z: boolean };
  rotation: "none" | "yaw" | "full";
  /** Keeps selected motion in the animated pose and suppresses its root delta. */
  bakeIntoPose: boolean;
};

export const DEFAULT_ROOT_MOTION_POLICY: RootMotionPolicy = {
  mode: "disabled",
  source: "clip",
  translationAxes: { x: true, y: true, z: true },
  rotation: "yaw",
  bakeIntoPose: false,
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function normalizeRootMotionPolicy(value: unknown): RootMotionPolicy {
  const input = record(value) ?? {};
  const axes = record(input.translationAxes) ?? {};
  return {
    mode: input.mode === "applyToObject" || input.mode === "extractOnly" ? input.mode : "disabled",
    source: input.source === "rootBone" || input.source === "hips" ? input.source : "clip",
    translationAxes: {
      x: axes.x !== false,
      y: axes.y !== false,
      z: axes.z !== false,
    },
    rotation: input.rotation === "none" || input.rotation === "full" ? input.rotation : "yaw",
    bakeIntoPose: input.bakeIntoPose === true,
  };
}

export type AnimatorComponent = {
  version: 1;
  enabled: boolean;
  /** Scene-owned state machine. Legacy controllerRef takes precedence until migrated. */
  controller?: AnimatorController;
  /** Read-only compatibility path for scenes authored before embedded controllers. */
  controllerRef?: AssetRef;
  avatarRef?: AssetRef;
  rootMotion: RootMotionPolicy;
  updateMode: "normal" | "unscaledTime" | "fixedStep";
  cullingMode: "alwaysAnimate" | "basedOnRenderVisibility";
  parameterOverrides: AnimatorParameterOverride[];
  extensions?: CharacterDocumentExtensions;
};

export const DEFAULT_ANIMATOR_COMPONENT: AnimatorComponent = {
  version: 1,
  enabled: true,
  controller: createAnimatorController("embedded-controller", "Animator Controller"),
  rootMotion: DEFAULT_ROOT_MOTION_POLICY,
  updateMode: "normal",
  cullingMode: "basedOnRenderVisibility",
  parameterOverrides: [],
};

/** Returns an authored component with no shared mutable nested state. */
export function createDefaultAnimatorComponent(
  controllerId = "embedded-controller",
  controllerName = "Animator Controller",
): AnimatorComponent {
  return {
    ...DEFAULT_ANIMATOR_COMPONENT,
    controller: createAnimatorController(controllerId, controllerName),
    rootMotion: {
      ...DEFAULT_ROOT_MOTION_POLICY,
      translationAxes: { ...DEFAULT_ROOT_MOTION_POLICY.translationAxes },
    },
    parameterOverrides: [],
  };
}
