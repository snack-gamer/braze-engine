import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterAxis, CharacterQuaternion, CharacterTransform, CharacterVector3 } from "../domain/character-values";
import {
  DEFAULT_HUMANOID_POSE_TUNING,
  type HumanBoneMapping,
  type HumanoidAvatarDefinition,
  type HumanoidBoneName,
  type HumanoidMuscleLimits,
  type HumanoidPoseTuning,
} from "../domain/humanoid-avatar";
import type { BoneDefinition, BoneId, SkeletonDefinition } from "../domain/skeleton";
import { validateHumanoidMapping } from "./humanoid-mapping";

export type BuildHumanoidAvatarInput = Readonly<{
  name: string;
  sourceRef: AssetRef;
  skeletonRef: AssetRef;
  skeleton: SkeletonDefinition;
  mapping: HumanBoneMapping;
  forwardAxis?: CharacterAxis;
  upAxis?: CharacterAxis;
  tuning?: Partial<HumanoidPoseTuning>;
  muscleLimits?: HumanoidMuscleLimits;
  referencePose?: Partial<Record<HumanoidBoneName, CharacterTransform>>;
}>;

/** Builds the complete, serializable Avatar artifact from persisted import intent. */
export function buildHumanoidAvatarDefinition(input: BuildHumanoidAvatarInput): HumanoidAvatarDefinition {
  const mapping = { ...input.mapping };
  const bones = new Map(input.skeleton.bones.map((bone) => [bone.id, bone]));
  const referencePose: Partial<Record<HumanoidBoneName, CharacterTransform>> = {};
  for (const [humanBone, boneId] of Object.entries(mapping) as Array<[HumanoidBoneName, BoneId]>) {
    const authored = input.referencePose?.[humanBone];
    const source = authored ?? bones.get(boneId)?.bindLocal;
    if (source) referencePose[humanBone] = cloneTransform(source);
  }
  const validation = validateHumanoidMapping(input.skeleton.bones, mapping);
  const axes = perpendicularAxes(input.forwardAxis ?? "+z", input.upAxis ?? "+y");
  const tuning = { ...DEFAULT_HUMANOID_POSE_TUNING, ...input.tuning };
  const muscleLimits = cloneMuscleLimits(input.muscleLimits);
  return {
    version: 1,
    id: `${input.sourceRef.guid}:${input.sourceRef.localId ?? "main"}:avatar`,
    name: input.name.trim() || `${input.skeleton.name} Avatar`,
    revision: avatarRevision(
      input.skeleton.compatibilitySignature,
      mapping,
      referencePose,
      axes,
      tuning,
      muscleLimits,
    ),
    sourceRef: { ...input.sourceRef },
    skeletonRef: { ...input.skeletonRef },
    mapping,
    referencePose: { space: "skeletonLocal", bones: referencePose },
    humanScale: deriveHumanScale(input.skeleton, mapping, axes.up),
    forwardAxis: axes.forward,
    upAxis: axes.up,
    tuning,
    ...(muscleLimits ? { muscleLimits } : {}),
    validation,
  };
}

function cloneMuscleLimits(value: HumanoidMuscleLimits | undefined): HumanoidMuscleLimits | undefined {
  if (!value) return undefined;
  const output = Object.fromEntries(Object.entries(value).map(([name, limit]) => [name, {
    minimum: [...limit.minimum],
    maximum: [...limit.maximum],
  }]));
  return Object.keys(output).length > 0 ? output : undefined;
}

function cloneTransform(value: CharacterTransform): CharacterTransform {
  return {
    translation: [...value.translation],
    rotation: [...value.rotation],
    scale: [...value.scale],
  };
}

function perpendicularAxes(forward: CharacterAxis, up: CharacterAxis) {
  return forward.slice(1) === up.slice(1)
    ? { forward: "+z" as const, up: "+y" as const }
    : { forward, up };
}

function deriveHumanScale(
  skeleton: SkeletonDefinition,
  mapping: HumanBoneMapping,
  upAxis: CharacterAxis,
): number {
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  const world = new Map<BoneId, WorldTransform>();
  const positionFor = (slot: HumanoidBoneName) => {
    const id = mapping[slot];
    return id ? worldTransform(id, byId, world, new Set()).position : null;
  };
  const head = positionFor("head");
  const feet = [positionFor("leftFoot"), positionFor("rightFoot")].filter(
    (position): position is CharacterVector3 => Boolean(position),
  );
  if (head && feet.length > 0) {
    const axis = axisIndex(upAxis);
    const height = Math.max(...feet.map((foot) => Math.abs(head[axis] - foot[axis])));
    if (Number.isFinite(height) && height > 0.0001) return height;
  }
  const mappedPositions = Object.values(mapping).flatMap((id) => (
    id && byId.has(id) ? [worldTransform(id, byId, world, new Set()).position] : []
  ));
  if (mappedPositions.length < 2) return 1;
  const min = [Infinity, Infinity, Infinity] as CharacterVector3;
  const max = [-Infinity, -Infinity, -Infinity] as CharacterVector3;
  mappedPositions.forEach((position) => position.forEach((value, axis) => {
    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }));
  const upExtent = Math.abs(max[axisIndex(upAxis)] - min[axisIndex(upAxis)]);
  return Math.max(0.0001, upExtent || vectorDistance(min, max));
}

function axisIndex(axis: CharacterAxis): 0 | 1 | 2 {
  return axis.endsWith("x") ? 0 : axis.endsWith("y") ? 1 : 2;
}

type WorldTransform = Readonly<{
  position: CharacterVector3;
  rotation: CharacterQuaternion;
  scale: CharacterVector3;
}>;

function worldTransform(
  id: BoneId,
  byId: ReadonlyMap<BoneId, BoneDefinition>,
  cache: Map<BoneId, WorldTransform>,
  visiting: Set<BoneId>,
): WorldTransform {
  const cached = cache.get(id);
  if (cached) return cached;
  const bone = byId.get(id);
  if (!bone || visiting.has(id)) return { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  visiting.add(id);
  const parent = bone.parentId
    ? worldTransform(bone.parentId, byId, cache, visiting)
    : { position: [0, 0, 0] as CharacterVector3, rotation: [0, 0, 0, 1] as CharacterQuaternion, scale: [1, 1, 1] as CharacterVector3 };
  visiting.delete(id);
  const localTranslation: CharacterVector3 = [
    bone.bindLocal.translation[0] * parent.scale[0],
    bone.bindLocal.translation[1] * parent.scale[1],
    bone.bindLocal.translation[2] * parent.scale[2],
  ];
  const rotated = rotate(parent.rotation, localTranslation);
  const result: WorldTransform = {
    position: [parent.position[0] + rotated[0], parent.position[1] + rotated[1], parent.position[2] + rotated[2]],
    rotation: multiply(parent.rotation, bone.bindLocal.rotation),
    scale: [
      parent.scale[0] * bone.bindLocal.scale[0],
      parent.scale[1] * bone.bindLocal.scale[1],
      parent.scale[2] * bone.bindLocal.scale[2],
    ],
  };
  cache.set(id, result);
  return result;
}

function rotate(q: CharacterQuaternion, value: CharacterVector3): CharacterVector3 {
  const [x, y, z] = value;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function multiply(a: CharacterQuaternion, b: CharacterQuaternion): CharacterQuaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function vectorDistance(left: CharacterVector3, right: CharacterVector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function avatarRevision(
  skeletonSignature: string,
  mapping: HumanBoneMapping,
  referencePose: Partial<Record<HumanoidBoneName, CharacterTransform>>,
  axes: Readonly<{ forward: CharacterAxis; up: CharacterAxis }>,
  tuning: HumanoidPoseTuning,
  muscleLimits: HumanoidMuscleLimits | undefined,
): string {
  const canonical = JSON.stringify({
    skeletonSignature,
    mapping: Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right)),
    referencePose: Object.entries(referencePose).sort(([left], [right]) => left.localeCompare(right)),
    axes,
    tuning,
    muscleLimits: Object.entries(muscleLimits ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `avatar-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
