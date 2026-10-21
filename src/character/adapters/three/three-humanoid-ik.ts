import * as THREE from "three";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPoseApplication,
} from "../../application/playback/animator-playback-contracts";
import type { HumanoidIkGoal, HumanoidIkGoalName } from "../../application/playback/animator-playback-ik";
import type { HumanoidBoneName } from "../../domain/humanoid-avatar";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { bindExtractedThreeSkeleton } from "./three-skeleton-extractor";

type Limb = Readonly<{
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
}>;

const LIMB_SLOTS: Record<HumanoidIkGoalName, readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName]> = {
  leftFoot: ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
  rightFoot: ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
  leftHand: ["leftUpperArm", "leftLowerArm", "leftHand"],
  rightHand: ["rightUpperArm", "rightLowerArm", "rightHand"],
};

/** Bounded analytic two-bone IK and automatic Humanoid foot-floor stabilization. */
export class ThreeHumanoidIkSolver {
  private avatarId: string | null = null;
  private limbs = new Map<HumanoidIkGoalName, Limb>();
  private footFloorLocalY: number | null = null;

  constructor(private readonly body: THREE.Object3D) {}

  apply(
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<{ changed: boolean }> {
    const usesIk = application.plan.instructions.some((instruction) => (
      instruction.footIk || (instruction.ikPass && (application.ikGoalsByLayer?.get(instruction.layerId)?.length ?? 0) > 0)
    ));
    if (!usesIk) return characterRuntimeSuccess({ changed: false });
    if (application.avatar?.kind !== "humanoid") return characterRuntimeFailure(
      "humanoid-ik-avatar-required",
      "Foot IK and IK Pass require a resolved Humanoid Avatar.",
    );
    const diagnostics = this.bind(application.avatar);
    if (this.limbs.size === 0) return { value: null, diagnostics };
    this.body.updateMatrixWorld(true);
    this.captureFootFloor(application.avatar);
    let changed = false;
    for (const instruction of application.plan.instructions) {
      if (instruction.footIk) {
        changed = this.applyFootFloor("leftFoot", application.avatar, diagnostics) || changed;
        changed = this.applyFootFloor("rightFoot", application.avatar, diagnostics) || changed;
      }
      if (!instruction.ikPass) continue;
      for (const goal of application.ikGoalsByLayer?.get(instruction.layerId) ?? []) {
        changed = this.applyGoal(goal, diagnostics) || changed;
      }
    }
    return characterRuntimeSuccess({ changed }, diagnostics);
  }

  dispose(): void {
    this.avatarId = null;
    this.limbs.clear();
    this.footFloorLocalY = null;
  }

  private bind(avatar: Extract<AnimatorPlaybackAvatar, { kind: "humanoid" }>): CharacterRuntimeDiagnostic[] {
    if (this.avatarId === avatar.id) return [];
    this.avatarId = avatar.id;
    this.limbs.clear();
    this.footFloorLocalY = null;
    const binding = bindExtractedThreeSkeleton(this.body, avatar.skeleton);
    const diagnostics = binding.diagnostics.map(({ code, severity, message }) => ({ code, severity, message }));
    for (const goal of Object.keys(LIMB_SLOTS) as HumanoidIkGoalName[]) {
      const [upperSlot, lowerSlot, endSlot] = LIMB_SLOTS[goal];
      const upper = avatar.definition.mapping[upperSlot];
      const lower = avatar.definition.mapping[lowerSlot];
      const end = avatar.definition.mapping[endSlot];
      const limb = upper && lower && end ? {
        upper: binding.boneById.get(upper),
        lower: binding.boneById.get(lower),
        end: binding.boneById.get(end),
      } : null;
      if (limb?.upper && limb.lower && limb.end) this.limbs.set(goal, limb as Limb);
      else diagnostics.push({
        code: "humanoid-ik-limb-unbound",
        severity: "warning",
        message: `Humanoid IK cannot bind the ${goal} limb on this character.`,
      });
    }
    return diagnostics;
  }

  private captureFootFloor(avatar: Extract<AnimatorPlaybackAvatar, { kind: "humanoid" }>): void {
    if (this.footFloorLocalY !== null) return;
    const local = ["leftFoot", "rightFoot"].flatMap((goal) => {
      const end = this.limbs.get(goal as HumanoidIkGoalName)?.end;
      if (!end) return [];
      return [this.body.worldToLocal(end.getWorldPosition(new THREE.Vector3())).y];
    });
    this.footFloorLocalY = local.length > 0 ? Math.min(...local) : -avatar.definition.humanScale * 0.5;
  }

  private applyFootFloor(
    goal: "leftFoot" | "rightFoot",
    avatar: Extract<AnimatorPlaybackAvatar, { kind: "humanoid" }>,
    diagnostics: CharacterRuntimeDiagnostic[],
  ): boolean {
    const limb = this.limbs.get(goal);
    if (!limb || this.footFloorLocalY === null) return false;
    const world = limb.end.getWorldPosition(new THREE.Vector3());
    const local = this.body.worldToLocal(world.clone());
    const gap = local.y - this.footFloorLocalY;
    const threshold = Math.max(0.01, avatar.definition.humanScale * 0.06);
    if (gap >= threshold) return false;
    local.y = this.footFloorLocalY;
    const target = this.body.localToWorld(local);
    const weight = Math.max(0, Math.min(1, 1 - Math.max(0, gap) / threshold));
    return solveLimb(limb, target, undefined, weight, diagnostics, goal);
  }

  private applyGoal(goal: HumanoidIkGoal, diagnostics: CharacterRuntimeDiagnostic[]): boolean {
    const limb = this.limbs.get(goal.goal);
    if (!limb) return false;
    let changed = false;
    if (goal.position && goal.positionWeight > 0) changed = solveLimb(
      limb,
      new THREE.Vector3(...goal.position),
      goal.hintPosition ? new THREE.Vector3(...goal.hintPosition) : undefined,
      goal.positionWeight,
      diagnostics,
      goal.goal,
      goal.hintWeight ?? 0,
    );
    if (goal.rotation && goal.rotationWeight > 0) {
      setBoneWorldRotation(
        limb.end,
        limb.end.getWorldQuaternion(new THREE.Quaternion()).slerp(
          new THREE.Quaternion(...goal.rotation).normalize(),
          goal.rotationWeight,
        ),
      );
      changed = true;
    }
    return changed;
  }
}

function solveLimb(
  limb: Limb,
  requestedTarget: THREE.Vector3,
  hint: THREE.Vector3 | undefined,
  weight: number,
  diagnostics: CharacterRuntimeDiagnostic[],
  label: string,
  hintWeight = 1,
): boolean {
  limb.upper.updateWorldMatrix(true, true);
  const a = limb.upper.getWorldPosition(new THREE.Vector3());
  const b = limb.lower.getWorldPosition(new THREE.Vector3());
  const c = limb.end.getWorldPosition(new THREE.Vector3());
  const target = c.clone().lerp(requestedTarget, weight);
  const upperLength = a.distanceTo(b);
  const lowerLength = b.distanceTo(c);
  if (upperLength < 1.0e-6 || lowerLength < 1.0e-6) {
    diagnostics.push({
      code: "humanoid-ik-degenerate-limb",
      severity: "warning",
      message: `Humanoid IK skipped ${label} because its limb has zero-length bones.`,
    });
    return false;
  }
  const toTarget = target.clone().sub(a);
  const distance = Math.min(
    upperLength + lowerLength - 1.0e-6,
    Math.max(Math.abs(upperLength - lowerLength) + 1.0e-6, toTarget.length()),
  );
  const direction = toTarget.lengthSq() > 1.0e-12 ? toTarget.normalize() : c.clone().sub(a).normalize();
  const currentNormal = b.clone().sub(a).cross(c.clone().sub(b)).normalize();
  const hintNormal = hint ? direction.clone().cross(hint.clone().sub(a)).normalize() : currentNormal;
  const planeNormal = currentNormal.clone().lerp(hintNormal, hintWeight).normalize();
  if (planeNormal.lengthSq() < 1.0e-12) planeNormal.set(0, 0, 1);
  const bend = planeNormal.clone().cross(direction).normalize();
  if (bend.dot(b.clone().sub(a)) < 0) bend.negate();
  const adjacent = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - adjacent ** 2));
  const knee = a.clone().addScaledVector(direction, adjacent).addScaledVector(bend, height);
  rotateBoneToward(limb.upper, b.clone().sub(a), knee.clone().sub(a));
  limb.upper.updateWorldMatrix(true, true);
  const nextB = limb.lower.getWorldPosition(new THREE.Vector3());
  const nextC = limb.end.getWorldPosition(new THREE.Vector3());
  rotateBoneToward(limb.lower, nextC.sub(nextB), target.sub(nextB));
  limb.lower.updateWorldMatrix(true, true);
  return true;
}

function rotateBoneToward(bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3): void {
  if (from.lengthSq() < 1.0e-12 || to.lengthSq() < 1.0e-12) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  setBoneWorldRotation(bone, delta.multiply(world).normalize());
}

function setBoneWorldRotation(bone: THREE.Bone, world: THREE.Quaternion): void {
  const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}
