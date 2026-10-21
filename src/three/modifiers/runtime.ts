import * as THREE from "three";
import { motionPulseEasingProgress } from "../../lib/motion-pulse";
import type { BuoyancyModifier, MotionPulseTarget, SceneObject, Vec3 } from "../../types";
import { applyTransform, clampScaleValue } from "../transform";
import type { Runtime } from "../runtime";
import { sampleOcean } from "../water/sampler";

type BuoyancySample = {
  pinWorld: THREE.Vector3;
  waterY: number;
};

type BuoyancyState = {
  y: number;
  quaternion: THREE.Quaternion;
  lastTime: number;
};

const localTmp = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const baseUpTmp = new THREE.Vector3();
const targetUpTmp = new THREE.Vector3();
const tiltQuatTmp = new THREE.Quaternion();
const targetQuatTmp = new THREE.Quaternion();
const limitedNormalTmp = new THREE.Vector3();
const TAU = Math.PI * 2;

function modifierKey(objectId: string, modifierId: string): string {
  return `${objectId}:${modifierId}`;
}

function buoyancyStateKey(objectId: string): string {
  return modifierKey(objectId, "buoyancy-composite");
}

function waterFor(modifier: BuoyancyModifier, plan: RuntimeModifierPlan): SceneObject | undefined {
  if (modifier.waterObjectId) {
    const target = plan.objectsById.get(modifier.waterObjectId);
    if (target?.water && target.visible !== false) return target;
  }
  return plan.waterObjects[0];
}

function fitPlaneNormal(samples: BuoyancySample[]): THREE.Vector3 {
  if (samples.length < 3) {
    return worldUp.clone();
  }

  let sx = 0;
  let sz = 0;
  let sy = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  let sxy = 0;
  let szy = 0;
  for (const sample of samples) {
    const x = sample.pinWorld.x;
    const z = sample.pinWorld.z;
    const y = sample.waterY;
    sx += x;
    sz += z;
    sy += y;
    sxx += x * x;
    szz += z * z;
    sxz += x * z;
    sxy += x * y;
    szy += z * y;
  }

  const n = samples.length;
  const det =
    sxx * (szz * n - sz * sz) -
    sxz * (sxz * n - sz * sx) +
    sx * (sxz * sz - szz * sx);
  if (Math.abs(det) < 1e-6) return worldUp.clone();

  const detA =
    sxy * (szz * n - sz * sz) -
    sxz * (szy * n - sz * sy) +
    sx * (szy * sz - szz * sy);
  const detB =
    sxx * (szy * n - sz * sy) -
    sxy * (sxz * n - sz * sx) +
    sx * (sxz * sy - szy * sx);

  const a = detA / det;
  const b = detB / det;
  return new THREE.Vector3(-a, 1, -b).normalize();
}

function limitNormal(normal: THREE.Vector3, maxTiltDeg: number): THREE.Vector3 {
  const maxAngle = THREE.MathUtils.degToRad(Math.max(0, maxTiltDeg));
  const angle = worldUp.angleTo(normal);
  if (angle <= maxAngle || angle < 1e-5) return limitedNormalTmp.copy(normal);
  tiltQuatTmp.setFromUnitVectors(worldUp, normal);
  limitedNormalTmp.copy(worldUp).applyQuaternion(
    new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), tiltQuatTmp, maxAngle / angle),
  );
  return limitedNormalTmp.normalize();
}

function responseAlpha(damping: number, deltaTime: number): number {
  const clamped = THREE.MathUtils.clamp(damping, 0, 1);
  if (clamped <= 0.0001) return 1;
  const halfLife = THREE.MathUtils.lerp(0.04, 0.75, clamped);
  return 1 - Math.exp(-Math.max(0.0001, deltaTime) / halfLife);
}

function applyBuoyancy(
  runtime: Runtime,
  object: SceneObject,
  modifiers: BuoyancyModifier[],
  plan: RuntimeModifierPlan,
  elapsed: number,
): boolean {
  const node = runtime.objectMap.get(object.id);
  if (!node || object.water || object.primitive === "water" || object.primitive === "camera") return false;

  applyTransform(node, object);
  node.updateMatrixWorld(true);

  const samples: BuoyancySample[] = [];
  let deltaSum = 0;
  let dampingSum = 0;
  let tiltStrengthSum = 0;
  let maxTiltSum = 0;
  let tiltContributors = 0;

  for (const modifier of modifiers) {
    const water = waterFor(modifier, plan);
    if (!water) continue;
    dampingSum += modifier.damping;
    if (modifier.followTilt) {
      tiltStrengthSum += modifier.tiltStrength;
      maxTiltSum += modifier.maxTiltDeg;
      tiltContributors += 1;
    }
    const pins = modifier.pins.length > 0
      ? modifier.pins
      : [{ id: "center", name: "Center", localOffset: [0, 0, 0] as const }];
    for (const pin of pins) {
      localTmp.set(pin.localOffset[0], pin.localOffset[1], pin.localOffset[2]);
      const pinWorld = node.localToWorld(localTmp.clone());
      const sample = sampleOcean(water.water, pinWorld.x, pinWorld.z, elapsed);
      const waterY = water.position[1] + sample.height + modifier.verticalOffset;
      deltaSum += waterY - pinWorld.y;
      samples.push({ pinWorld, waterY });
    }
  }

  if (samples.length === 0) return true;

  const targetY = object.position[1] + deltaSum / samples.length;
  const baseQuat = node.quaternion.clone();
  targetQuatTmp.copy(baseQuat);

  const tiltStrength = tiltContributors > 0 ? tiltStrengthSum / tiltContributors : 0;
  if (samples.length >= 3 && tiltStrength > 0.0001) {
    const maxTiltDeg = maxTiltSum / Math.max(1, tiltContributors);
    const normal = limitNormal(fitPlaneNormal(samples), maxTiltDeg);
    targetUpTmp.copy(worldUp).lerp(normal, THREE.MathUtils.clamp(tiltStrength, 0, 1)).normalize();
    baseUpTmp.copy(worldUp).applyQuaternion(baseQuat).normalize();
    tiltQuatTmp.setFromUnitVectors(baseUpTmp, targetUpTmp);
    targetQuatTmp.multiplyQuaternions(tiltQuatTmp, baseQuat);
  }

  const key = buoyancyStateKey(object.id);
  const previous = runtime.modifierStates.get(key) as BuoyancyState | undefined;
  if (!previous) {
    runtime.modifierStates.set(key, {
      y: targetY,
      quaternion: targetQuatTmp.clone(),
      lastTime: elapsed,
    });
    node.position.y = targetY;
    node.quaternion.copy(targetQuatTmp);
    node.updateMatrixWorld(true);
    return true;
  }

  const damping = dampingSum / Math.max(1, modifiers.length);
  const alpha = responseAlpha(damping, elapsed - previous.lastTime);
  previous.y = THREE.MathUtils.lerp(previous.y, targetY, alpha);
  previous.quaternion.slerp(targetQuatTmp, alpha);
  previous.lastTime = elapsed;

  node.position.y = previous.y;
  node.quaternion.copy(previous.quaternion);
  node.updateMatrixWorld(true);
  return true;
}

type MotionPulseTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

function pulseValues(target: MotionPulseTarget, property: "position" | "rotation" | "scale"): Vec3 {
  const values = target[property];
  if (target.axisMode === "unified") return [values[0], values[0], values[0]];
  return values;
}

function hasMotionValues(target: MotionPulseTarget): boolean {
  return [...target.position, ...target.rotation, ...target.scale].some((value) => Math.abs(value) > 1e-9);
}

function cycleProgress(target: MotionPulseTarget, elapsed: number): { rotation: number; offset: number } {
  const cycles = Math.max(0, target.rate) * elapsed + target.phase;
  const whole = Math.floor(cycles);
  const local = cycles - whole;
  const eased = motionPulseEasingProgress(target.easing, local);
  switch (target.mode) {
    case "restart":
      return { rotation: eased, offset: eased };
    case "yoyo": {
      const yoyo = whole % 2 === 0 ? eased : 1 - eased;
      return { rotation: yoyo, offset: yoyo };
    }
    case "pulse": {
      const pulse = Math.sin(eased * TAU);
      return { rotation: pulse, offset: pulse };
    }
    case "loop":
    default:
      return { rotation: whole + eased, offset: eased };
  }
}

function applyMotionPulseComponents(runtime: Runtime, plan: RuntimeModifierPlan, elapsed: number): boolean {
  const { objectsById } = plan;
  const transforms = new Map<string, MotionPulseTransform>();

  for (const owner of plan.motionPulseOwners) {
    const component = owner.motionPulse;
    if (!component || component.enabled === false) continue;
    for (const target of component.targets ?? []) {
      if (target.enabled === false || !target.objectId || !hasMotionValues(target)) continue;
      const object = objectsById.get(target.objectId);
      const node = object ? runtime.objectMap.get(object.id) : undefined;
      if (!object || !node || object.primitive === "camera") continue;

      let transform = transforms.get(object.id);
      if (!transform) {
        transform = {
          position: [...object.position],
          rotation: [...object.rotation],
          scale: [...object.scale],
        };
        transforms.set(object.id, transform);
      }

      const { rotation: rotationProgress, offset: offsetProgress } = cycleProgress(target, elapsed);
      const position = pulseValues(target, "position");
      const rotation = pulseValues(target, "rotation");
      const scale = pulseValues(target, "scale");
      for (let axis = 0; axis < 3; axis += 1) {
        transform.position[axis] += position[axis] * offsetProgress;
        transform.rotation[axis] += rotation[axis] * 360 * rotationProgress;
        transform.scale[axis] = clampScaleValue(transform.scale[axis] + scale[axis] * offsetProgress);
      }
    }
  }

  let changed = false;
  for (const [objectId, transform] of transforms) {
    const object = objectsById.get(objectId);
    const node = runtime.objectMap.get(objectId);
    if (!object || !node) continue;
    applyTransform(node, { ...object, ...transform });
    node.updateMatrixWorld(true);
    changed = true;
  }
  return changed;
}

export function applyRuntimeModifiers(runtime: Runtime, objects: SceneObject[], elapsed: number): boolean {
  return applyRuntimeModifierPlan(runtime, elapsed, createRuntimeModifierPlan(objects));
}

export type RuntimeModifierPresence = {
  buoyancy: boolean;
  motionPulse: boolean;
};

type BuoyancyOwner = {
  object: SceneObject;
  modifiers: BuoyancyModifier[];
};

export type RuntimeModifierPlan = {
  presence: RuntimeModifierPresence;
  objectsById: Map<string, SceneObject>;
  waterObjects: SceneObject[];
  buoyancyOwners: BuoyancyOwner[];
  motionPulseOwners: SceneObject[];
};

/** Builds indexes once per immutable authored scene revision. */
export function createRuntimeModifierPlan(objects: SceneObject[]): RuntimeModifierPlan {
  const objectsById = new Map<string, SceneObject>();
  const waterObjects: SceneObject[] = [];
  const buoyancyOwners: BuoyancyOwner[] = [];
  const motionPulseOwners: SceneObject[] = [];
  for (const object of objects) {
    objectsById.set(object.id, object);
    if (object.water && object.visible !== false) waterObjects.push(object);
    const modifiers = (object.modifiers ?? []).filter(
      (modifier): modifier is BuoyancyModifier => modifier.enabled && modifier.type === "buoyancy",
    );
    if (modifiers.length > 0) buoyancyOwners.push({ object, modifiers });
    if (
      object.motionPulse?.enabled !== false
      && (object.motionPulse?.targets ?? []).some(
        (target) => target.enabled !== false && Boolean(target.objectId) && hasMotionValues(target),
      )
    ) {
      motionPulseOwners.push(object);
    }
  }
  return {
    presence: {
      buoyancy: buoyancyOwners.length > 0,
      motionPulse: motionPulseOwners.length > 0,
    },
    objectsById,
    waterObjects,
    buoyancyOwners,
    motionPulseOwners,
  };
}

export function runtimeModifierPresence(objects: SceneObject[]): RuntimeModifierPresence {
  return createRuntimeModifierPlan(objects).presence;
}

export function applyRuntimeModifierPlan(
  runtime: Runtime,
  elapsed: number,
  plan: RuntimeModifierPlan,
): boolean {
  const { presence } = plan;
  if (!presence.buoyancy && !presence.motionPulse) return false;
  if ((runtime.transformControls as typeof runtime.transformControls & { dragging?: boolean }).dragging) {
    return false;
  }

  let changed = false;
  if (presence.buoyancy) {
    for (const owner of plan.buoyancyOwners) {
      changed = applyBuoyancy(runtime, owner.object, owner.modifiers, plan, elapsed) || changed;
    }
  }
  if (presence.motionPulse) {
    changed = applyMotionPulseComponents(runtime, plan, elapsed) || changed;
  }
  return changed;
}

export function syncRuntimeModifierStates(runtime: Runtime, objects: SceneObject[]): void {
  const liveKeys = new Set<string>();
  for (const object of objects) {
    if ((object.modifiers ?? []).some((modifier) => modifier.type === "buoyancy")) {
      liveKeys.add(buoyancyStateKey(object.id));
    }
  }
  for (const key of runtime.modifierStates.keys()) {
    if (!liveKeys.has(key)) runtime.modifierStates.delete(key);
  }
}
