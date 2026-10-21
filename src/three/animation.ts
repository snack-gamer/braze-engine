import * as THREE from "three";
import { retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";
import { motionClipSourceId } from "../animation/motion";
import type { AnimationDocument, MotionClipTrack } from "../animation/types";
import type { SceneObject } from "../types";
import type { Runtime } from "./runtime";

type BodyClipInfo = {
  id: string;
  index: number;
};

export type MotionMixerState = {
  target: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction | null;
  sourceId: string;
};

type ImportedClipCache = Record<string, THREE.AnimationClip | undefined>;
type ImportedClipPending = Record<string, boolean | undefined>;
type RetargetedClipCache = Record<string, THREE.AnimationClip | undefined>;
type ResolvedClip = {
  clip: THREE.AnimationClip;
  root: THREE.Object3D;
};

function activeClip(document: AnimationDocument | undefined, objectId: string) {
  if (!document) return null;
  const track = document.tracks.find(
    (item): item is MotionClipTrack => item.kind === "motionClip" && item.objectId === objectId,
  );
  if (!track || !track.enabled) return null;
  return track.clips.find(
    (clip) => document.playhead >= clip.start && document.playhead <= clip.start + clip.duration,
  ) ?? null;
}

function ownBodyClip(object: SceneObject, body: THREE.Object3D, sourceId: string): ResolvedClip | undefined {
  const clips = body.userData.animationClips as THREE.AnimationClip[] | undefined;
  const infos = body.userData.animationClipInfos as BodyClipInfo[] | undefined;
  const info = infos?.find((item) => motionClipSourceId(object.id, item.id) === sourceId);
  const clip = info ? clips?.[info.index] : undefined;
  return clip ? { clip, root: body } : undefined;
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((child) => {
    if (found) return;
    const skinned = child as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) found = skinned;
  });
  return found;
}

function skeletonFromBones(root: THREE.Object3D): THREE.Skeleton | null {
  const bones: THREE.Bone[] = [];
  root.traverse((child) => {
    const bone = child as THREE.Bone;
    if (bone.isBone) bones.push(bone);
  });
  return bones.length > 0 ? new THREE.Skeleton(bones) : null;
}

function rigBones(rig: THREE.SkinnedMesh | THREE.Skeleton) {
  return rig instanceof THREE.Skeleton ? rig.bones : rig.skeleton.bones;
}

function boneKey(name: string) {
  return name
    .replace(/^.*:/, "")
    .replace(/^mixamorig/i, "")
    .replace(/[_\-. ]/g, "")
    .toLowerCase();
}

function sourceBoneNameMap(sourceRig: THREE.SkinnedMesh | THREE.Skeleton) {
  const map = new Map<string, string>();
  for (const bone of rigBones(sourceRig)) {
    map.set(boneKey(bone.name), bone.name);
  }
  return map;
}

function hipName(sourceRig: THREE.SkinnedMesh | THREE.Skeleton) {
  return rigBones(sourceRig).find((bone) => /^(hips?|pelvis)$/i.test(boneKey(bone.name)))?.name ?? "Hips";
}

function targetRig(body: THREE.Object3D) {
  return findSkinnedMesh(body);
}

function sourceRig(sourceObject: THREE.Object3D) {
  return findSkinnedMesh(sourceObject) ?? skeletonFromBones(sourceObject);
}

function makeRetargetedClip(
  target: THREE.SkinnedMesh,
  source: THREE.SkinnedMesh | THREE.Skeleton,
  clip: THREE.AnimationClip,
) {
  const sourceNames = sourceBoneNameMap(source);
  const retargeted = retargetClip(target, source, clip, {
    fps: Math.min(60, Math.max(12, Math.round(clip.tracks.length > 0 ? 30 : 24))),
    hip: hipName(source),
    hipInfluence: new THREE.Vector3(1, 1, 1),
    preserveBoneMatrix: true,
    preserveBonePositions: true,
    useFirstFramePosition: true,
    getBoneName: (bone) => sourceNames.get(boneKey(bone.name)) ?? bone.name,
  } as Parameters<typeof retargetClip>[3] & { preserveBonePositions?: boolean });
  target.skeleton.pose();
  target.updateMatrixWorld(true);
  return retargeted;
}

function importedClip(
  runtime: Runtime,
  object: SceneObject,
  body: THREE.Object3D,
  document: AnimationDocument,
  sourceId: string,
  retarget: boolean,
): ResolvedClip | undefined {
  const cacheKey = retarget ? `${sourceId}:retarget` : sourceId;
  const cache = (body.userData.importedMotionClips ??= {}) as ImportedClipCache & RetargetedClipCache;
  if (cache[cacheKey]) {
    const root = retarget ? targetRig(body) ?? body : body;
    return { clip: cache[cacheKey], root };
  }

  const source = document.motionSources.find((item) => item.id === sourceId && item.objectId === object.id);
  if (!source) return undefined;

  const pending = (body.userData.importedMotionPending ??= {}) as ImportedClipPending;
  if (!pending[cacheKey]) {
    pending[cacheKey] = true;
    const assetLease = runtime.assetCache.acquire(source.sourceUrl, source.sourceType);
    assetLease.value
      .then((loaded) => {
        pending[cacheKey] = false;
        if (runtime.disposed || !body.parent) return;
        const sourceClip = loaded.animations[source.clipIndex];
        if (sourceClip && retarget) {
          const target = targetRig(body);
          const sourceSkeleton = sourceRig(loaded.object);
          cache[cacheKey] = target && sourceSkeleton
            ? makeRetargetedClip(target, sourceSkeleton, sourceClip)
            : sourceClip;
        } else if (sourceClip) {
          cache[cacheKey] = sourceClip;
        }
        if (!runtime.disposed && body.parent && cache[cacheKey]) {
          syncMotionClipAnimation(runtime, object, body, document);
        }
      })
      .catch((error) => {
        pending[cacheKey] = false;
        if (!runtime.disposed) console.error("motion clip load failed", error);
      })
      .finally(assetLease.release);
  }
  return undefined;
}

export function syncMotionClipAnimation(
  runtime: Runtime,
  object: SceneObject,
  body: THREE.Object3D,
  document?: AnimationDocument,
) {
  if (runtime.editorPosePreviewObjectIds.has(object.id)) {
    removeRuntimeMotionMixer(runtime, object.id);
    return;
  }
  const instance = activeClip(document, object.id);
  if (!instance) {
    removeRuntimeMotionMixer(runtime, object.id);
    return;
  }

  const resolved = ownBodyClip(object, body, instance.sourceId) ??
    (document ? importedClip(runtime, object, body, document, instance.sourceId, instance.retarget) : undefined);
  if (!resolved) return;

  let state = runtime.motionMixers.get(object.id);
  if (!state || state.target !== resolved.root || state.sourceId !== instance.sourceId) {
    if (state) disposeMotionMixerState(state);
    const mixer = new THREE.AnimationMixer(resolved.root);
    const action = mixer.clipAction(resolved.clip);
    action.enabled = true;
    action.clampWhenFinished = true;
    action.play();
    state = { target: resolved.root, mixer, action, sourceId: instance.sourceId };
    runtime.motionMixers.set(object.id, state);
  }

  const localTime = Math.min(Math.max(document!.playhead - instance.start + instance.offset, 0), resolved.clip.duration);
  state.action?.setEffectiveWeight(instance.weight);
  state.mixer.setTime(localTime);
}

export function disposeMotionMixerState(state: MotionMixerState): void {
  state.mixer.stopAllAction();
  state.mixer.uncacheRoot(state.target);
}

export function removeRuntimeMotionMixer(runtime: Runtime, objectId: string): void {
  const state = runtime.motionMixers.get(objectId);
  if (!state) return;
  disposeMotionMixerState(state);
  runtime.motionMixers.delete(objectId);
}

export function disposeRuntimeMotionMixers(runtime: Runtime): void {
  for (const state of runtime.motionMixers.values()) disposeMotionMixerState(state);
  runtime.motionMixers.clear();
}
