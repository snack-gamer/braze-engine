import * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

export type ThreePreviewClipBinding = Readonly<{
  root: THREE.Object3D;
  clip: THREE.AnimationClip;
  weight?: number;
}>;

export type ThreeAnimationPreviewSession = Readonly<{
  sample: (timeSeconds: number) => void;
  setWeight: (clip: THREE.AnimationClip, weight: number) => void;
  dispose: () => void;
}>;

/** Creates a manually sampled preview session. It never owns a frame clock. */
export function createThreeAnimationPreviewSession(
  bindings: readonly ThreePreviewClipBinding[],
  options: Readonly<{ poseRoots?: readonly THREE.Object3D[] }> = {},
): CharacterRuntimeResult<ThreeAnimationPreviewSession> {
  if (bindings.length === 0) return characterRuntimeFailure(
    "empty-animation-preview",
    "Animation preview requires at least one clip binding.",
  );
  const mixers = new Map<THREE.Object3D, THREE.AnimationMixer>();
  const actions = new Map<THREE.AnimationClip, Set<THREE.AnimationAction>>();
  const poses = new Map<THREE.Object3D, readonly PreviewPoseRecord[]>();
  const explicitPoseRoots = options.poseRoots ?? [];
  for (const root of explicitPoseRoots) {
    if (!poses.has(root)) poses.set(root, capturePreviewPose(root));
  }
  for (const binding of bindings) {
    const mixer = mixers.get(binding.root) ?? new THREE.AnimationMixer(binding.root);
    mixers.set(binding.root, mixer);
    if (explicitPoseRoots.length === 0 && !poses.has(binding.root)) {
      poses.set(binding.root, capturePreviewPose(binding.root));
    }
    const action = mixer.clipAction(binding.clip);
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(clamp01(binding.weight ?? 1));
    action.play();
    const clipActions = actions.get(binding.clip) ?? new Set<THREE.AnimationAction>();
    clipActions.add(action);
    actions.set(binding.clip, clipActions);
  }
  let disposed = false;
  return characterRuntimeSuccess({
    sample: (timeSeconds) => {
      if (disposed || !Number.isFinite(timeSeconds)) return;
      actions.forEach((clipActions) => clipActions.forEach((action) => {
        action.enabled = true;
        action.paused = false;
      }));
      mixers.forEach((mixer, root) => {
        mixer.setTime(Math.max(0, timeSeconds));
        root.updateMatrixWorld(true);
      });
    },
    setWeight: (clip, weight) => {
      if (!disposed) actions.get(clip)?.forEach((action) => action.setEffectiveWeight(clamp01(weight)));
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mixers.forEach((mixer, root) => {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
      });
      mixers.clear();
      actions.clear();
      poses.forEach(restorePreviewPose);
      poses.clear();
    },
  });
}

type PreviewPoseRecord = Readonly<{
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  morphTargetInfluences?: readonly number[];
}>;

function capturePreviewPose(root: THREE.Object3D): PreviewPoseRecord[] {
  const pose: PreviewPoseRecord[] = [];
  root.traverse((object) => {
    const morphs = (object as THREE.Mesh).morphTargetInfluences;
    pose.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      ...(Array.isArray(morphs) ? { morphTargetInfluences: [...morphs] } : {}),
    });
  });
  return pose;
}

function restorePreviewPose(pose: readonly PreviewPoseRecord[]): void {
  pose.forEach((item) => {
    item.object.position.copy(item.position);
    item.object.quaternion.copy(item.quaternion);
    item.object.scale.copy(item.scale);
    const morphs = (item.object as THREE.Mesh).morphTargetInfluences;
    if (item.morphTargetInfluences && Array.isArray(morphs)) {
      item.morphTargetInfluences.forEach((value, index) => { morphs[index] = value; });
    }
  });
  pose[0]?.object.updateMatrixWorld(true);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
