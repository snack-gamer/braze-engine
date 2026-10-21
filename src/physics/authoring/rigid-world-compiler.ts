import type { CompiledPhysicsScene } from "../runtime/contracts";
import {
  type RigidBodyDescriptor,
  type RigidPrimitiveShape,
  type RigidWorldDescriptor,
} from "../runtime/rigid-world-descriptor";
import type { PhysicsVec3 } from "../domain/components";
import { compileCompoundBodies } from "./compound-body-compiler";
import { compileStaticMesh } from "./static-mesh-compiler";
import { compileRigidJoints } from "./rigid-joint-compiler";

/** Reject unsupported authoring before allocating or starting a replacement world. */
export function compileRigidWorld(compiled: CompiledPhysicsScene): RigidWorldDescriptor {
  const errors = compiled.diagnostics.filter((issue) => issue.severity === "error").map((issue) => `${issue.objectId}: ${issue.message}`);
  const bodies: RigidBodyDescriptor[] = [];
  for (const body of compiled.bodies) {
    const prefix = `${body.objectId} (${body.colliderId})`;
    if (body.interpolation !== "none") errors.push(`${prefix}: set Rigidbody interpolation to None for this first solver slice.`);
    const { collider, worldScale: scale } = body;
    if (collider.shape === "mesh") {
      try { bodies.push(...compileStaticMesh(body)); } catch (error) { errors.push(`${prefix}: ${String(error)}`); }
      continue;
    }
    let shape: RigidPrimitiveShape;
    if (collider.shape === "sphere") {
      const largest = Math.max(...scale);
      if (largest - Math.min(...scale) > largest * 1e-5) {
        errors.push(`${prefix}: sphere colliders require uniform world scale.`);
      }
      shape = { kind: "sphere", radius: collider.radius * largest };
    } else if (collider.shape === "capsule") {
      if (Math.abs(scale[1] - scale[2]) > Math.max(scale[1], scale[2]) * 1e-5) errors.push(`${prefix}: capsules require equal radial world scales.`);
      shape = { kind: "capsule", radius: collider.radius * scale[1], halfLength: collider.length * scale[0] / 2 };
    } else if (collider.shape === "box") {
      shape = { kind: "box", halfExtents: collider.size.map((size, axis) => size * scale[axis] / 2) as PhysicsVec3 };
    } else {
      errors.push(`${prefix}: ${collider.shape} collision is not implemented in this slice.`);
      continue;
    }
    const volume = shape.kind === "sphere"
      ? 4 / 3 * Math.PI * shape.radius ** 3
      : shape.kind === "capsule" ? Math.PI * shape.radius ** 2 * shape.halfLength * 2 + 4 / 3 * Math.PI * shape.radius ** 3
      : 8 * shape.halfExtents[0] * shape.halfExtents[1] * shape.halfExtents[2];
    const mass = body.bodyType === "dynamic"
      ? (body.massMode === "manual" ? body.mass : body.density * volume)
      : 0;
    const inertia = inertiaFor(shape, mass);
    const values = [...body.position, ...body.orientation, volume, mass, ...inertia];
    if (!values.every(Number.isFinite) || volume <= 0 || (body.bodyType === "dynamic" && mass <= 0)) {
      errors.push(`${prefix}: collision dimensions and dynamic mass must be positive and finite.`);
    }
    bodies.push({
      binding: {
        objectId: body.objectId,
        colliderId: body.colliderId,
        objectLocalOffset: [...body.objectLocalOffset],
        objectLocalOrientation: [...body.objectLocalOrientation],
        writesObjectPose: body.bodyType !== "static" && body.writesObjectPose,
        interpolation: body.interpolation,
        bodyType: body.bodyType,
        objectPosition: [...body.objectPosition],
        objectOrientation: [...body.objectOrientation],
      },
      shape,
      position: [...body.position],
      orientation: [...body.orientation],
      mass,
      inertia,
      gravityScale: body.useGravity ? 1 : 0,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      friction: collider.friction,
      restitution: collider.restitution,
      isTrigger: collider.isTrigger,
      collisionLayer: collider.collisionLayer,
      collisionMask: collider.collisionMask,
    });
  }
  if (errors.length) throw new Error(`Rigid solver cannot start:\n${errors.join("\n")}`);
  const combined = compileCompoundBodies(bodies);
  return { bodies: combined, joints: compileRigidJoints(compiled.joints ?? [], combined), gravity: [...compiled.settings.gravity], fixedTimestep: compiled.settings.fixedTimestep };
}

function inertiaFor(shape: RigidPrimitiveShape, mass: number): PhysicsVec3 {
  if (shape.kind === "sphere") {
    const moment = 0.4 * mass * shape.radius ** 2;
    return [moment, moment, moment];
  }
  if (shape.kind === "capsule") {
    const r = shape.radius, length = shape.halfLength * 2;
    const cylinder = Math.PI * r * r * length, caps = 4 / 3 * Math.PI * r ** 3;
    const mc = mass * cylinder / (cylinder + caps), ms = mass - mc;
    const axial = 0.5 * mc * r * r + 0.4 * ms * r * r;
    const transverse = mc * (3 * r * r + length * length) / 12 + ms * (0.4 * r * r + length * length / 4 + 3 * length * r / 8);
    return [transverse, axial, transverse];
  }
  const [x, y, z] = shape.halfExtents;
  return [mass * (y * y + z * z) / 3, mass * (x * x + z * z) / 3, mass * (x * x + y * y) / 3];
}
