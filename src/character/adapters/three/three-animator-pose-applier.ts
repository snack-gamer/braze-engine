import * as THREE from "three";
import type { RootMotionPolicy } from "../../domain/animator-component";
import type { BoneId, SkeletonDefinition } from "../../domain/skeleton";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPoseApplication,
  AnimatorPoseApplier,
} from "../../application/playback/animator-playback-contracts";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import {
  applyRootMotionDelta,
  type RootMotionLoopBoundary,
  type RootMotionPose,
  type RootMotionSink,
} from "../../runtime/root-motion";
import { ThreeAnimatorActionCache, type ThreeAnimatorClipResource } from "./three-animator-action-cache";
import { ThreeAuthoredPoseSnapshot } from "./three-authored-pose-snapshot";
import {
  bindExtractedThreeSkeleton,
  extractThreeSkeletonDefinition,
} from "./three-skeleton-extractor";
import { ThreeHumanoidIkSolver } from "./three-humanoid-ik";

type ThreeAnimatorPoseBackend = Readonly<{
  pose: AnimatorPoseApplier<ThreeAnimatorClipResource>;
  rootMotionSink: RootMotionSink;
}>;

/** Creates a clockless Three pose backend for one loaded scene-object clone. */
export function createThreeAnimatorPoseBackend(
  sceneNode: THREE.Object3D,
  body: THREE.Object3D,
  camera?: THREE.Camera,
  visibility?: () => boolean,
): CharacterRuntimeResult<ThreeAnimatorPoseBackend> {
  try {
    const pose = new ThreeAnimatorPoseApplier(sceneNode, body, camera);
    if (visibility) pose.isVisible = visibility;
    const diagnostics: CharacterRuntimeDiagnostic[] = [{
      code: "three-animator-compatibility-backend",
      severity: "info",
      message: "This viewport uses the bounded Three pose backend; it owns no frame clock or loader resources.",
    }];
    if (!camera && !visibility) diagnostics.push({
      code: "animator-culling-hierarchy-only",
      severity: "warning",
      message: "Render-visibility culling has no viewport camera and can only honor hierarchy visibility.",
    });
    else if (containsSkinnedMesh(body)) diagnostics.push({
      code: "animator-culling-conservative-authored-bounds",
      severity: "info",
      message: "Skinned-character culling uses expanded authored bounds; extreme procedural deformation should use Always Animate.",
    });
    return characterRuntimeSuccess({ pose, rootMotionSink: pose.rootMotionSink }, diagnostics);
  } catch (error) {
    return characterRuntimeFailure(
      "three-animator-initialization-failed",
      `Three Animator initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

class ThreeAnimatorPoseApplier implements AnimatorPoseApplier<ThreeAnimatorClipResource> {
  private readonly authoredPose: ThreeAuthoredPoseSnapshot;
  private readonly actions: ThreeAnimatorActionCache;
  private readonly ik: ThreeHumanoidIkSolver;
  private readonly extractedSkeleton: SkeletonDefinition | null;
  private lastApplication: AnimatorPoseApplication<ThreeAnimatorClipResource> | null = null;
  private bindingDefinition: SkeletonDefinition | null = null;
  private boneById = new Map<BoneId, THREE.Bone>();
  private lastRootBone: THREE.Bone | null = null;
  private readonly authoredBoundingSphere: THREE.Sphere | null;
  private readonly frustum = new THREE.Frustum();
  private readonly projectionView = new THREE.Matrix4();
  private readonly worldSphere = new THREE.Sphere();
  private disposed = false;

  readonly rootMotionSink: RootMotionSink = {
    applyRootMotion: ({ delta }) => {
      const applied = applyRootMotionDelta({
        position: this.sceneNode.position.toArray() as [number, number, number],
        rotation: this.sceneNode.quaternion.toArray() as [number, number, number, number],
      }, delta);
      if (!applied.value || this.disposed) return;
      this.sceneNode.position.fromArray(applied.value.position);
      this.sceneNode.quaternion.fromArray(applied.value.rotation);
      this.sceneNode.updateMatrixWorld(true);
    },
  };

  constructor(
    private readonly sceneNode: THREE.Object3D,
    private readonly body: THREE.Object3D,
    private readonly camera?: THREE.Camera,
  ) {
    this.authoredPose = new ThreeAuthoredPoseSnapshot(body, sceneNode);
    this.actions = new ThreeAnimatorActionCache(body);
    this.ik = new ThreeHumanoidIkSolver(body);
    this.extractedSkeleton = extractThreeSkeletonDefinition(body).definition;
    this.authoredBoundingSphere = localBoundingSphere(body);
  }

  isVisible = (): boolean => {
    let cursor: THREE.Object3D | null = this.body;
    while (cursor) {
      if (!cursor.visible) return false;
      cursor = cursor.parent;
    }
    if (this.camera && this.authoredBoundingSphere) {
      this.camera.updateMatrixWorld();
      this.projectionView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projectionView);
      this.worldSphere.copy(this.authoredBoundingSphere).applyMatrix4(this.body.matrixWorld);
      if (!this.frustum.intersectsSphere(this.worldSphere)) return false;
    }
    return true;
  };

  applyPose = (
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<{ changed: boolean }> => {
    this.lastApplication = application;
    return this.actions.apply(application);
  };

  applyPostProcess = (
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<{ changed: boolean }> => {
    return this.ik.apply(application);
  };

  readRootMotionPose = (
    policy: RootMotionPolicy,
  ): CharacterRuntimeResult<RootMotionPose | null> => {
    const resolved = this.rootMotionBone(policy);
    if (!resolved.value) return { value: null, diagnostics: resolved.diagnostics };
    this.lastRootBone = resolved.value;
    return characterRuntimeSuccess(localRootPose(resolved.value), resolved.diagnostics);
  };

  readRootMotionLoopBoundary = (
    policy: RootMotionPolicy,
    previousPlan: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"],
    currentPlan: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"],
  ): CharacterRuntimeResult<RootMotionLoopBoundary | null> => {
    const previous = strongestBaseClip(previousPlan);
    const current = strongestBaseClip(currentPlan);
    if (!previous || !current
      || previous.clipId !== current.clipId
      || previous.sampleId !== current.sampleId
      || !this.lastApplication) {
      return characterRuntimeFailure({
        code: "ambiguous-root-motion-loop",
        severity: "warning",
        message: "Root-motion loop boundaries require one continuous dominant base clip.",
      });
    }
    const root = this.rootMotionBone(policy);
    if (!root.value) return { value: null, diagnostics: root.diagnostics };
    const clip = this.lastApplication.clipsById.get(current.clipId)?.resource.bindings[0]?.clip;
    if (!clip) return characterRuntimeFailure({
      code: "missing-root-motion-clip",
      severity: "warning",
      message: `Root-motion clip ${current.clipId} is unavailable.`,
    });
    const rest = this.authoredPose.restTransform(root.value);
    if (!rest) return characterRuntimeFailure({
      code: "missing-root-motion-rest-pose",
      severity: "warning",
      message: "The selected root-motion bone is absent from the authored pose snapshot.",
    });
    return characterRuntimeSuccess({
      cycleStart: sampleBonePose(clip, root.value, rest, 0),
      cycleEnd: sampleBonePose(clip, root.value, rest, clip.duration),
    }, root.diagnostics);
  };

  removeRootMotionFromPose = (
    policy: RootMotionPolicy,
  ): CharacterRuntimeResult<void> => {
    const bone = this.lastRootBone;
    const rest = bone ? this.authoredPose.restTransform(bone) : undefined;
    if (!bone || !rest) return characterRuntimeFailure({
      code: "missing-root-motion-rest-pose",
      severity: "warning",
      message: "The selected root-motion bone cannot be restored to its authored pose.",
    });
    if (policy.translationAxes.x) bone.position.x = rest.position.x;
    if (policy.translationAxes.y) bone.position.y = rest.position.y;
    if (policy.translationAxes.z) bone.position.z = rest.position.z;
    if (policy.rotation === "full") bone.quaternion.copy(rest.quaternion);
    else if (policy.rotation === "yaw") removeLocalYaw(bone.quaternion, rest.quaternion);
    bone.updateMatrixWorld(true);
    return characterRuntimeSuccess(undefined);
  };

  restoreAuthoredPose = (): void => {
    this.actions.dispose();
    this.ik.dispose();
    this.authoredPose.restore();
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.actions.dispose();
    this.ik.dispose();
    this.lastApplication = null;
    this.boneById.clear();
    this.lastRootBone = null;
  };

  private rootMotionBone(policy: RootMotionPolicy): CharacterRuntimeResult<THREE.Bone> {
    const application = this.lastApplication;
    const avatar = application?.avatar;
    const definition = avatar?.skeleton ?? this.extractedSkeleton;
    if (!application || !definition) return characterRuntimeFailure(
      "missing-root-motion-skeleton",
      "Root motion requires a resolved target skeleton.",
    );
    const bindingDiagnostics = this.bindSkeleton(definition);
    const id = rootMotionBoneId(policy, application, avatar, definition);
    const bone = id ? this.boneById.get(id) : undefined;
    if (!bone) return characterRuntimeFailure([
      ...bindingDiagnostics,
      {
        code: "missing-root-motion-bone",
        severity: "error",
        message: `The ${policy.source} root-motion source is not bound to the live skeleton.`,
      },
    ]);
    return characterRuntimeSuccess(bone, bindingDiagnostics);
  }

  private bindSkeleton(definition: SkeletonDefinition): CharacterRuntimeDiagnostic[] {
    if (this.bindingDefinition === definition) return [];
    const binding = bindExtractedThreeSkeleton(this.body, definition);
    this.bindingDefinition = definition;
    this.boneById = new Map(binding.boneById);
    return binding.diagnostics.map(({ code, severity, message }) => ({ code, severity, message }));
  }
}

function rootMotionBoneId(
  policy: RootMotionPolicy,
  application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  avatar: AnimatorPlaybackAvatar | undefined,
  skeleton: SkeletonDefinition,
): BoneId | undefined {
  if (policy.source === "hips") return avatar?.kind === "humanoid"
    ? avatar.definition.mapping.hips
    : undefined;
  if (policy.source === "rootBone") return avatar?.motionRootBoneId
    ?? avatar?.rootBoneId
    ?? skeleton.rootBoneIds[0];
  const clipId = strongestBaseClip(application.plan)?.clipId;
  return clipId
    ? application.clipsById.get(clipId)?.metadata.rootMotion?.sourceBoneId
    : undefined;
}

function strongestBaseClip(plan: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"]) {
  return plan.instructions[0]?.clips.reduce((strongest, sample) => (
    !strongest || sample.weight > strongest.weight ? sample : strongest
  ), undefined as (typeof plan.instructions)[number]["clips"][number] | undefined);
}

function localRootPose(bone: THREE.Bone): RootMotionPose {
  return {
    position: bone.position.toArray() as [number, number, number],
    rotation: bone.quaternion.toArray() as [number, number, number, number],
  };
}

function sampleBonePose(
  clip: THREE.AnimationClip,
  bone: THREE.Bone,
  rest: { position: THREE.Vector3; quaternion: THREE.Quaternion },
  timeSeconds: number,
): RootMotionPose {
  const position = rest.position.clone();
  const rotation = rest.quaternion.clone();
  for (const track of clip.tracks) {
    const property = trackBoneProperty(track, bone.name);
    if (!property || (property !== "position" && property !== "quaternion")) continue;
    const interpolating = track as unknown as {
      createInterpolant: () => { evaluate: (time: number) => ArrayLike<number> };
    };
    const value = interpolating.createInterpolant().evaluate(timeSeconds);
    if (property === "position" && value.length >= 3) position.fromArray(value);
    if (property === "quaternion" && value.length >= 4) rotation.fromArray(value).normalize();
  }
  return {
    position: position.toArray() as [number, number, number],
    rotation: rotation.toArray() as [number, number, number, number],
  };
}

function trackBoneProperty(track: THREE.KeyframeTrack, boneName: string): string | null {
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const target = parsed.objectName === "bones" ? parsed.objectIndex : parsed.nodeName;
    return target === boneName ? parsed.propertyName : null;
  } catch {
    return null;
  }
}

function removeLocalYaw(current: THREE.Quaternion, rest: THREE.Quaternion): void {
  const delta = rest.clone().invert().multiply(current).normalize();
  const yaw = Math.atan2(
    2 * (delta.w * delta.y + delta.x * delta.z),
    1 - 2 * (delta.y * delta.y + delta.z * delta.z),
  );
  const yawInverse = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  current.copy(rest).multiply(yawInverse.multiply(delta)).normalize();
}

function localBoundingSphere(body: THREE.Object3D): THREE.Sphere | null {
  body.updateMatrixWorld(true);
  const worldBox = new THREE.Box3().setFromObject(body);
  if (worldBox.isEmpty()) return null;
  const sphere = worldBox.getBoundingSphere(new THREE.Sphere());
  const inverse = body.matrixWorld.clone().invert();
  sphere.center.applyMatrix4(inverse);
  const worldScale = new THREE.Vector3();
  body.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale);
  const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z), 1.0e-6);
  sphere.radius = sphere.radius / scale * 1.5;
  return sphere;
}

function containsSkinnedMesh(body: THREE.Object3D): boolean {
  let found = false;
  body.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) found = true; });
  return found;
}
