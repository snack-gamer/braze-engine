import type { ColliderComponent, RigidbodyComponent } from "../domain/components";
import type { SceneObject, Vec3 } from "../../types";
import type { PhysicsWorldSettings } from "../domain/world-settings";
import type { CompiledPhysicsBody, CompiledPhysicsScene } from "../runtime/contracts";
import {
  normalizeCollider,
  normalizeRigidbody,
} from "./component-defaults";
import { compileHierarchyWorldTransforms, type HierarchyWorldTransform } from "./hierarchy-world";
import { normalizePhysicsWorldSettings } from "../domain/world-settings";
import type { Quat4 } from "./coordinates";
import { compileAuthoredJoints } from "./joint-scene-compiler";

type AuthoredCollider = {
  object: SceneObject;
  collider: ColliderComponent;
  transform: HierarchyWorldTransform;
};

function rotateVector(vector: Vec3, quaternion: Quat4): Vec3 {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
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

function multiplyQuaternions(left: Quat4, right: Quat4): Quat4 {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function inverseUnitQuaternion(quaternion: Quat4): Quat4 {
  return [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]];
}

function addVectors(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtractVectors(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scaledColliderVolume(collider: ColliderComponent, scale: Vec3): number {
  if (collider.shape === "sphere") {
    const radius = collider.radius * Math.max(...scale);
    return (4 / 3) * Math.PI * radius ** 3;
  }
  if (collider.shape === "capsule") {
    const orientedScale = capsuleOrientedScale(collider, scale);
    const radius = collider.radius * Math.max(orientedScale[1], orientedScale[2]);
    const length = collider.length * orientedScale[0];
    return Math.PI * radius ** 2 * length + (4 / 3) * Math.PI * radius ** 3;
  }
  if (collider.shape === "torus") {
    const major = collider.majorRadius * Math.max(scale[0], scale[1]);
    const minor = collider.minorRadius * Math.max(...scale);
    return 2 * Math.PI ** 2 * major * minor ** 2;
  }
  return collider.size[0] * scale[0] * collider.size[1] * scale[1] * collider.size[2] * scale[2];
}

function compileColliderBody(args: {
  authored: AuthoredCollider;
  rigidbodyOwner: SceneObject;
  ownerTransform: HierarchyWorldTransform;
  rigidbody: RigidbodyComponent | null;
  mass: number;
  index: number;
}): CompiledPhysicsBody {
  const { authored, rigidbodyOwner, ownerTransform, rigidbody, mass, index } = args;
  const { collider, object, transform } = authored;
  const objectScale = transform.scale.map((value) => Math.max(0.001, Math.abs(value))) as Vec3;
  const worldScale = collider.shape === "capsule"
    ? capsuleOrientedScale(collider, objectScale)
    : objectScale;
  const scaledCenter: Vec3 = [
    collider.center[0] * objectScale[0],
    collider.center[1] * objectScale[1],
    collider.center[2] * objectScale[2],
  ];
  const position = addVectors(transform.position, rotateVector(scaledCenter, transform.orientation));
  const orientation = collider.shape === "capsule"
    ? multiplyQuaternions(transform.orientation, capsuleAxisOrientation(collider))
    : transform.orientation;
  const colliderToOwner = inverseUnitQuaternion(orientation);
  const bodyType = rigidbody?.bodyType ?? "static";
  return {
    objectId: rigidbodyOwner.id,
    colliderOwnerId: object.id,
    colliderId: collider.id,
    compoundId: rigidbodyOwner.id,
    writesObjectPose: index === 0,
    bodyType,
    massMode: rigidbody?.massMode ?? "automatic",
    mass,
    density: bodyType === "dynamic" ? rigidbody?.density ?? 1 : 0,
    useGravity: bodyType === "dynamic" && (rigidbody?.useGravity ?? true),
    linearDamping: bodyType === "dynamic" ? rigidbody?.linearDamping ?? 0 : 0,
    angularDamping: bodyType === "dynamic" ? rigidbody?.angularDamping ?? 0 : 0,
    interpolation: rigidbody?.interpolation ?? "none",
    position,
    orientation: [...orientation],
    objectPosition: [...ownerTransform.position],
    objectOrientation: [...ownerTransform.orientation],
    worldScale,
    objectLocalOffset: rotateVector(subtractVectors(ownerTransform.position, position), colliderToOwner),
    objectLocalOrientation: multiplyQuaternions(colliderToOwner, ownerTransform.orientation),
    collider,
  };
}

function capsuleOrientedScale(collider: ColliderComponent, scale: Vec3): Vec3 {
  if (collider.axis === "y") return [scale[1], scale[0], scale[2]];
  if (collider.axis === "z") return [scale[2], scale[1], scale[0]];
  return [...scale];
}

function capsuleAxisOrientation(collider: ColliderComponent): Quat4 {
  const halfTurn = Math.SQRT1_2;
  // Authored capsules use local Y; rotate when authoring requests X or Z.
  if (collider.axis === "x") return [0, 0, -halfTurn, halfTurn];
  if (collider.axis === "z") return [halfTurn, 0, 0, halfTurn];
  return [0, 0, 0, 1];
}

/** Compiles public authoring components into backend-neutral rigid bodies. */
export function compileAuthoredPhysicsScene(
  objects: SceneObject[],
  name: string,
  worldSettings: PhysicsWorldSettings,
): CompiledPhysicsScene {
  const settings = normalizePhysicsWorldSettings(worldSettings);
  const transforms = compileHierarchyWorldTransforms(objects);
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const rigidbodies = new Map<string, RigidbodyComponent>();
  for (const object of objects) {
    if (object.rigidbody?.enabled) rigidbodies.set(object.id, normalizeRigidbody(object.rigidbody));
  }

  const nearestRigidbodyOwner = (object: SceneObject): SceneObject | null => {
    let cursor: SceneObject | undefined = object;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      if (rigidbodies.has(cursor.id)) return cursor;
      cursor = cursor.parentId ? objectById.get(cursor.parentId) : undefined;
    }
    return null;
  };

  const compoundColliders = new Map<string, AuthoredCollider[]>();
  const staticColliders: AuthoredCollider[] = [];
  const diagnostics: CompiledPhysicsScene["diagnostics"] = [];
  const shearReported = new Set<string>();

  for (const object of objects) {
    const transform = transforms.get(object.id);
    if (!transform) continue;
    const colliders = (object.colliders ?? [])
      .map((collider, index) => normalizeCollider(collider, object, `${object.id}-collider-${index + 1}`))
      .filter((collider) => collider.enabled);
    if (colliders.length === 0) continue;
    if (transform.hasShear && !shearReported.has(object.id)) {
      shearReported.add(object.id);
      diagnostics.push({
        severity: "error",
        code: "unsupported-sheared-transform",
        objectId: object.id,
        message: "Hierarchy shear from rotated non-uniform scale is unsupported; use uniform parent scale.",
      });
    }
    const owner = nearestRigidbodyOwner(object);
    for (const collider of colliders) {
      const authored = { object, collider, transform };
      if (!owner) {
        staticColliders.push(authored);
      } else {
        const group = compoundColliders.get(owner.id) ?? [];
        group.push(authored);
        compoundColliders.set(owner.id, group);
      }
    }
  }

  const bodies: CompiledPhysicsBody[] = [];
  for (const authored of staticColliders) {
    bodies.push(compileColliderBody({
      authored,
      rigidbodyOwner: authored.object,
      ownerTransform: authored.transform,
      rigidbody: null,
      mass: 0,
      index: 0,
    }));
  }

  for (const object of objects) {
    const rigidbody = rigidbodies.get(object.id);
    if (!rigidbody) continue;
    const colliders = compoundColliders.get(object.id) ?? [];
    const ownerTransform = transforms.get(object.id);
    if (!ownerTransform) continue;
    if (ownerTransform.hasShear && !shearReported.has(object.id)) {
      shearReported.add(object.id);
      diagnostics.push({
        severity: "error",
        code: "unsupported-sheared-transform",
        objectId: object.id,
        message: "Hierarchy shear from rotated non-uniform scale is unsupported; use uniform parent scale.",
      });
    }
    if (colliders.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "missing-collider",
        objectId: object.id,
        message: "This Rigidbody has no enabled Collider on itself or its child hierarchy and is excluded from simulation.",
      });
      continue;
    }
    const volumes = colliders.map(({ collider, transform }) => {
      const scale = transform.scale.map((value) => Math.max(0.001, Math.abs(value))) as Vec3;
      return Math.max(1.0e-12, scaledColliderVolume(collider, scale));
    });
    const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
    colliders.forEach((authored, index) => {
      const manualMass = rigidbody.bodyType === "dynamic" && rigidbody.massMode === "manual"
        ? rigidbody.mass * volumes[index]! / totalVolume
        : 0;
      bodies.push(compileColliderBody({
        authored,
        rigidbodyOwner: object,
        ownerTransform,
        rigidbody,
        mass: manualMass,
        index,
      }));
    });
  }

  return { name, settings, bodies, diagnostics, joints: compileAuthoredJoints(objects, transforms, diagnostics) };
}
