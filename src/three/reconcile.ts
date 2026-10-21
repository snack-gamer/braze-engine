import * as THREE from "three";
import type { Material, SceneObject } from "../types";
import { BOT_ASSET_PREP_VERSION, isAvatarBotObject } from "../lib/bots";
import { motionClipSourceId } from "../animation/motion";
import type { AnimationDocument } from "../animation/types";
import {
  buildDirectionalLightBody,
  buildAssetLoadingBody,
  buildImageBody,
  buildParticleBody,
  buildPlaceholderBody,
  buildPrimitiveBody,
} from "./bodies";
import { buildCameraEditorBody } from "./camera-editor-body";
import { describeAnimationClips, type AssetAnimationClipInfo } from "./assets";
import { disposeObject } from "./dispose";
import { applyMaterialsToBody, materialSignature } from "./materials";
import { syncDisplacerMaterialsForBody } from "./modifiers/displacer-material";
import { applyTransform, markIds } from "./transform";
import { PLACEHOLDER, type BodyKind, type NodeUserData, type Runtime } from "./runtime";
import { emitSceneRenderStatus, markSceneDirty } from "./runtime";
import { syncMotionClipAnimation } from "./animation";
import { buildWaterBody, syncWaterBody, waterBodyKey } from "./water/water-body";
import { cloneImportedAsset, disposeStaleImportedClone } from "./resources/imported-asset-lifetime";
import { emitRuntimeBodyLifecycle } from "./reconciliation/body-lifecycle";

type NodeSyncContext = {
  object: SceneObject;
  showEditorOverlays: boolean;
  material: Material | null;
  materialLibrary: Material[];
  animationDocument?: AnimationDocument;
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
};

type ReconcileNodeUserData = NodeUserData & {
  latestSyncContext?: NodeSyncContext;
};

function resyncLoadedBody(runtime: Runtime, node: THREE.Group): NodeSyncContext | undefined {
  const context = (node.userData as ReconcileNodeUserData).latestSyncContext;
  if (!context) return undefined;
  syncNode(
    runtime,
    node,
    context.object,
    context.showEditorOverlays,
    context.material,
    context.materialLibrary,
    context.animationDocument,
    context.onAssetAnimationsDiscovered,
    {
      preserveRuntimeTransform: runtime.scenePlaybackMode !== "edit"
        && context.object.rigidbody?.enabled === true
        && context.object.rigidbody.bodyType === "dynamic",
    },
  );
  return context;
}

function expectedBody(object: SceneObject): { kind: BodyKind; key: string } {
  // Cameras carry a small body + lens visual that doubles as the raycast pick
  // target — without it the SceneNode is an empty Group, so viewport clicks
  // fall through and the user can't select cameras from the 3D view.
  if (object.primitive === "cloner") return { kind: "none", key: "cloner:none" };
  if (object.primitive === "effector") return { kind: "none", key: "effector:none" };
  if (object.primitive === "camera") return { kind: "camera-body", key: "camera-body" };
  if (object.primitive === "directionalLight") {
    return { kind: "directional-light-body", key: "directional-light-body" };
  }
  if (object.water || object.primitive === "water") return { kind: "water", key: waterBodyKey(object) };
  if (object.primitive === "transform") return { kind: "none", key: "transform:none" };
  if (object.primitive === "particle") return { kind: "particle", key: "particle:emitter-marker" };
  if (object.primitive === "image") return { kind: "image", key: `image:${object.assetUrl ?? ""}` };
  if (object.primitive === "fbx" || object.primitive === "usdz" || object.primitive === "usd" || object.primitive === "gltf") {
    if (!object.assetUrl) return { kind: "placeholder", key: PLACEHOLDER };
    const prepVersion = isAvatarBotObject(object) ? `:${BOT_ASSET_PREP_VERSION}` : "";
    return { kind: "asset", key: `${object.primitive}:${object.assetUrl}${prepVersion}` };
  }
  return { kind: "primitive", key: `primitive:${object.primitive}` };
}

export function findBody(node: THREE.Group): THREE.Object3D | null {
  // Modifier handles (e.g. buoyancy pin gizmos) live as siblings of the body
  // under the same SceneNode. After the placeholder is swapped for the loaded
  // asset, child order becomes [handle, body], so children[0] is no longer
  // safe. Authored hierarchy children are siblings too, and must never be
  // removed or disposed as if they were the parent's render body.
  for (const child of node.children) {
    if (!child.userData.modifierHandle && child.userData.sceneObjectNode !== true) return child;
  }
  return null;
}

/** Updates editor chrome and the context consumed by a pending async body. */
export function syncNodeEditorOverlayVisibility(node: THREE.Group, visible: boolean): void {
  const data = node.userData as ReconcileNodeUserData;
  if (data.latestSyncContext) data.latestSyncContext.showEditorOverlays = visible;
  const body = findBody(node);
  if (body) body.visible = visible;
}

function setBody(
  runtime: Runtime,
  node: THREE.Group,
  body: THREE.Object3D,
  kind: BodyKind,
  key: string,
  object: SceneObject,
) {
  const existing = findBody(node);
  emitRuntimeBodyLifecycle(runtime, {
    phase: "willChange",
    objectId: object.id,
    node,
    previousBody: existing,
    nextBody: body,
    nextKind: kind,
  });
  if (existing) {
    node.remove(existing);
    disposeObject(existing);
  }
  node.add(body);
  markIds(body, object.id);
  if (kind === "camera-body" || kind === "directional-light-body") body.userData.editorChrome = true;
  const data = node.userData as NodeUserData;
  data.bodyKind = kind;
  data.bodyKey = key;
  data.materialKey = "";
  emitRuntimeBodyLifecycle(runtime, {
    phase: "didChange",
    objectId: object.id,
    node,
    previousBody: existing,
    nextBody: body,
    nextKind: kind,
  });
}

function markAssetLoadStarted(
  runtime: Runtime,
  data: NodeUserData,
  key: string,
  release: () => void,
): number {
  data.assetLoadRelease?.();
  if (data.assetLoadKey && data.assetLoadKey !== key) {
    runtime.pendingAssetLoads.delete(data.assetLoadKey);
  }
  data.assetLoadGeneration += 1;
  data.assetLoadKey = key;
  data.assetLoadRelease = release;
  runtime.failedAssetLoads.delete(key);
  runtime.pendingAssetLoads.add(key);
  markSceneDirty(runtime);
  emitSceneRenderStatus(runtime);
  return data.assetLoadGeneration;
}

function markAssetLoadFinished(
  runtime: Runtime,
  data: NodeUserData,
  key: string,
  generation: number,
  error?: unknown,
) {
  if (data.assetLoadKey !== key || data.assetLoadGeneration !== generation) return;
  runtime.pendingAssetLoads.delete(key);
  data.assetLoadKey = undefined;
  data.assetLoadRelease = undefined;
  if (error) runtime.failedAssetLoads.set(key, error instanceof Error ? error.message : String(error));
  markSceneDirty(runtime);
  emitSceneRenderStatus(runtime);
}

function ownsAssetLoad(
  runtime: Runtime,
  node: THREE.Group,
  objectId: string,
  bodyKey: string,
  loadKey: string,
  generation: number,
): boolean {
  const data = node.userData as NodeUserData;
  return !runtime.disposed
    && runtime.objectMap.get(objectId) === node
    && data.objectId === objectId
    && data.bodyKey === bodyKey
    && data.assetLoadKey === loadKey
    && data.assetLoadGeneration === generation;
}

/** Invalidates async body work before a scene node is replaced or disposed. */
export function invalidateNodeAssetLoad(runtime: Runtime, node: THREE.Group): void {
  const data = node.userData as NodeUserData;
  data.assetLoadGeneration += 1;
  data.assetLoadRelease?.();
  data.assetLoadRelease = undefined;

  const statusKeys = new Set<string>();
  if (data.assetLoadKey) statusKeys.add(data.assetLoadKey);
  if (data.objectId && data.bodyKey) statusKeys.add(`${data.objectId}:${data.bodyKey}`);
  data.assetLoadKey = undefined;

  let statusChanged = false;
  for (const key of statusKeys) {
    statusChanged = runtime.pendingAssetLoads.delete(key) || statusChanged;
    statusChanged = runtime.failedAssetLoads.delete(key) || statusChanged;
  }
  if (statusChanged) {
    markSceneDirty(runtime);
    emitSceneRenderStatus(runtime);
  }
}

function syncMeshRendererFlags(body: THREE.Object3D, object: SceneObject): boolean {
  let changed = false;
  const castShadows = object.meshRenderer?.castShadows;
  const receiveShadows = object.meshRenderer?.receiveShadows;
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (castShadows !== undefined && mesh.castShadow !== castShadows) {
      mesh.castShadow = castShadows;
      changed = true;
    }
    if (receiveShadows !== undefined && mesh.receiveShadow !== receiveShadows) {
      mesh.receiveShadow = receiveShadows;
      changed = true;
    }
  });
  return changed;
}

export function syncNode(
  runtime: Runtime,
  node: THREE.Group,
  object: SceneObject,
  showEditorOverlays: boolean,
  material: Material | null,
  materialLibrary: Material[] = [],
  animationDocument?: AnimationDocument,
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void,
  options: { preserveRuntimeTransform?: boolean } = {},
) {
  const data = node.userData as ReconcileNodeUserData;
  data.latestSyncContext = {
    object,
    showEditorOverlays,
    material,
    materialLibrary,
    animationDocument,
    onAssetAnimationsDiscovered,
  };
  const want = expectedBody(object);

  if (data.bodyKey !== want.key) {
    invalidateNodeAssetLoad(runtime, node);
    if (want.kind === "none") {
      const existing = findBody(node);
      emitRuntimeBodyLifecycle(runtime, {
        phase: "willChange",
        objectId: object.id,
        node,
        previousBody: existing,
        nextBody: null,
        nextKind: "none",
      });
      if (existing) {
        node.remove(existing);
        disposeObject(existing);
      }
      markSceneDirty(runtime);
      data.bodyKind = "none";
      data.bodyKey = want.key;
      data.materialKey = "";
      emitRuntimeBodyLifecycle(runtime, {
        phase: "didChange",
        objectId: object.id,
        node,
        previousBody: existing,
        nextBody: null,
        nextKind: "none",
      });
    } else if (want.kind === "primitive") {
      setBody(runtime, node, buildPrimitiveBody(object), "primitive", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "water") {
      setBody(runtime, node, buildWaterBody(object), "water", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "image") {
      setBody(runtime, node, buildImageBody(object), "image", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "particle") {
      setBody(runtime, node, buildParticleBody(object), "particle", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "camera-body") {
      setBody(runtime, node, buildCameraEditorBody(), "camera-body", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "directional-light-body") {
      setBody(runtime, node, buildDirectionalLightBody(), "directional-light-body", want.key, object);
      markSceneDirty(runtime);
    } else if (want.kind === "placeholder") {
      setBody(runtime, node, buildPlaceholderBody(), "placeholder", PLACEHOLDER, object);
      markSceneDirty(runtime);
    } else if (want.kind === "asset" && object.assetUrl) {
      const placeholder = findBody(node);
      const promiseUrl = object.assetUrl;
      if (!placeholder || (data.bodyKind !== "placeholder" && data.bodyKind !== "asset")) {
        setBody(runtime, node, buildAssetLoadingBody(), "placeholder", PLACEHOLDER, object);
        markSceneDirty(runtime);
      }
      // Even though the body is currently a placeholder, mark the *intended*
      // body key so duplicate syncs don't keep re-triggering loads.
      data.bodyKey = want.key;
      const assetLoadKey = `${object.id}:${want.key}`;
      const assetLease = runtime.assetCache.acquire(promiseUrl, object.primitive);
      const assetLoadGeneration = markAssetLoadStarted(runtime, data, assetLoadKey, assetLease.release);
      let assetClone: THREE.Object3D | null = null;
      let assetAttached = false;
      assetLease.value
        .then((loaded) => {
          if (!ownsAssetLoad(runtime, node, object.id, want.key, assetLoadKey, assetLoadGeneration)) {
            assetLease.release();
            return;
          }
          const clone = cloneImportedAsset(assetLease, loaded);
          assetClone = clone;
          const latestObject = data.latestSyncContext?.object ?? object;
          const clipInfos = describeAnimationClips(loaded.animations, promiseUrl, object.primitive);
          clone.userData.animationClips = loaded.animations;
          clone.userData.animationClipInfos = clipInfos;
          clone.userData.characterImportDiagnostics = loaded.characterDiagnostics ?? [];
          clone.userData.animationClipSourceIds = clipInfos.map((info) => motionClipSourceId(latestObject.id, info.id));
          clone.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = latestObject.meshRenderer?.castShadows ?? true;
              mesh.receiveShadow = latestObject.meshRenderer?.receiveShadows ?? true;
            }
          });
          if (!ownsAssetLoad(runtime, node, object.id, want.key, assetLoadKey, assetLoadGeneration)) {
            disposeStaleImportedClone(clone);
            assetClone = null;
            return;
          }
          setBody(runtime, node, clone, "asset", want.key, latestObject);
          assetAttached = true;
          const latestContext = resyncLoadedBody(runtime, node);
          markAssetLoadFinished(
            runtime,
            node.userData as NodeUserData,
            assetLoadKey,
            assetLoadGeneration,
          );
          runtime.clonersDirty = true;
          runtime.labelsDirty = true;
          if (clipInfos.length > 0) {
            latestContext?.onAssetAnimationsDiscovered?.(latestObject.id, clipInfos);
          }
        })
        .catch((err) => {
          if (assetClone && !assetAttached) disposeStaleImportedClone(assetClone);
          else if (!assetClone) assetLease.release();
          if (!ownsAssetLoad(runtime, node, object.id, want.key, assetLoadKey, assetLoadGeneration)) return;
          markAssetLoadFinished(
            runtime,
            node.userData as NodeUserData,
            assetLoadKey,
            assetLoadGeneration,
            err,
          );
          console.error("asset load failed", err);
        });
    }
  }

  const wantMatKey = materialSignature(object, material, materialLibrary);
  const body = findBody(node);
  if (body && (object.water || object.primitive === "water")) syncWaterBody(body, object);
  if (body && syncMeshRendererFlags(body, object)) markSceneDirty(runtime);
  if (data.materialKey !== wantMatKey) {
    if (body) applyMaterialsToBody(body, object, material, materialLibrary);
    data.materialKey = wantMatKey;
    markSceneDirty(runtime);
  } else if (body && syncDisplacerMaterialsForBody(body, object)) {
    markSceneDirty(runtime);
  }

  // Transform last — never bypass React's commit, but re-apply on sync so the
  // viewport reflects any state change (e.g. via the inspector).
  if (!options.preserveRuntimeTransform) {
    applyTransform(node, object);
    if (body) syncMotionClipAnimation(runtime, object, body, animationDocument);
  }

  // Camera bodies are editor chrome. Hide them during control-capture flows
  // (depth/mask) so they don't appear in captured render passes.
  // They still pick correctly while visible.
  if (object.primitive === "camera" || object.primitive === "directionalLight") {
    syncNodeEditorOverlayVisibility(node, showEditorOverlays);
  }
}

export function createNode(object: SceneObject) {
  const node = new THREE.Group();
  node.name = object.name || object.id;
  const data: NodeUserData = {
    sceneObjectNode: true,
    objectId: object.id,
    bodyKind: "placeholder",
    bodyKey: "",
    materialKey: "",
    assetLoadGeneration: 0,
  };
  node.userData = data;
  return node;
}
