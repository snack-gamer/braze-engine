import * as THREE from "three";
import type { Runtime } from "./runtime";

type DefaultedRuntimeKey =
  | "disposed"
  | "motionMixers"
  | "editorPosePreviewObjectIds"
  | "bbox"
  | "modifierStates"
  | "modifierHandleMap"
  | "selectedModifierHandle"
  | "colliderGizmoMap"
  | "colliderHandleMap"
  | "selectedColliderHandle"
  | "clonerOutputs"
  | "clonerSignatures"
  | "clonersDirty"
  | "pendingAssetLoads"
  | "failedAssetLoads"
  | "renderFrame"
  | "framesSinceSceneChange"
  | "lastRenderStatusKey"
  | "authoredDirectionalLightActive"
  | "authoredDirectionalLightObjectId"
  | "authoredDirectionalLightSettings"
  | "authoredDirectionalLightDirection"
  | "sky"
  | "labelsDirty";

export type ViewportRuntimeSeed = Omit<Runtime, DefaultedRuntimeKey>;

/** Applies the invariant empty state shared by every newly assembled viewport runtime. */
export function createViewportRuntime(seed: ViewportRuntimeSeed): Runtime {
  return {
    ...seed,
    disposed: false,
    motionMixers: new Map(),
    editorPosePreviewObjectIds: new Set(),
    bbox: new THREE.Box3(),
    modifierStates: new Map<string, unknown>(),
    modifierHandleMap: new Map(),
    selectedModifierHandle: null,
    colliderGizmoMap: new Map(),
    colliderHandleMap: new Map(),
    selectedColliderHandle: null,
    clonerOutputs: new Map(),
    clonerSignatures: new Map(),
    clonersDirty: true,
    pendingAssetLoads: new Set(),
    failedAssetLoads: new Map(),
    renderFrame: 0,
    framesSinceSceneChange: 0,
    lastRenderStatusKey: "",
    authoredDirectionalLightActive: false,
    authoredDirectionalLightObjectId: null,
    authoredDirectionalLightSettings: null,
    authoredDirectionalLightDirection: null,
    sky: null,
    labelsDirty: true,
  };
}
