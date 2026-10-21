import type { ColliderComponent, Vec3 } from "../../types";

type ColliderGeometry = Pick<
  ColliderComponent,
  "shape" | "axis" | "size" | "radius" | "length" | "majorRadius" | "minorRadius"
>;

type EditableColliderGeometry = ColliderGeometry & Pick<ColliderComponent, "center">;

export type ColliderFaceAxis = 0 | 1 | 2;
export type ColliderFaceDirection = -1 | 1;

const MIN_GEOMETRY = 0.001;

/** Local half-extents used to position the six scene-view face handles. */
export function colliderLocalExtents(collider: EditableColliderGeometry): Vec3 {
  if (collider.shape === "sphere") return [collider.radius, collider.radius, collider.radius];
  if (collider.shape === "capsule") {
    const extents: Vec3 = [collider.radius, collider.radius, collider.radius];
    extents[collider.axis === "y" ? 1 : collider.axis === "z" ? 2 : 0] = collider.length * 0.5 + collider.radius;
    return extents;
  }
  if (collider.shape === "torus") {
    const radial = collider.majorRadius + collider.minorRadius;
    return [radial, radial, collider.minorRadius];
  }
  return collider.size.map((value) => value * 0.5) as Vec3;
}

export function colliderFacePosition(
  collider: EditableColliderGeometry,
  axis: ColliderFaceAxis,
  direction: ColliderFaceDirection,
): Vec3 {
  const position = [...collider.center] as Vec3;
  position[axis] += colliderLocalExtents(collider)[axis] * direction;
  return position;
}

/** Prevents a face from crossing the fixed opposite face (or the shape center). */
export function clampColliderFacePosition(
  collider: EditableColliderGeometry,
  axis: ColliderFaceAxis,
  direction: ColliderFaceDirection,
  position: number,
): number {
  if (collider.shape === "box") {
    const opposite = collider.center[axis] - direction * collider.size[axis] * 0.5;
    return direction > 0
      ? Math.max(opposite + MIN_GEOMETRY, position)
      : Math.min(opposite - MIN_GEOMETRY, position);
  }
  const distance = Math.max(MIN_GEOMETRY, direction * (position - collider.center[axis]));
  return collider.center[axis] + direction * distance;
}

/** Converts one dragged local face into authored collider dimensions. */
export function colliderFacePatchFromPosition(
  collider: EditableColliderGeometry,
  axis: ColliderFaceAxis,
  direction: ColliderFaceDirection,
  position: number,
): Partial<ColliderComponent> {
  const moving = clampColliderFacePosition(collider, axis, direction, position);
  if (collider.shape === "box") {
    const opposite = collider.center[axis] - direction * collider.size[axis] * 0.5;
    const size = [...collider.size] as Vec3;
    const center = [...collider.center] as Vec3;
    size[axis] = Math.max(MIN_GEOMETRY, Math.abs(moving - opposite));
    center[axis] = (moving + opposite) * 0.5;
    return { center, size };
  }

  const distance = Math.max(MIN_GEOMETRY, Math.abs(moving - collider.center[axis]));
  if (collider.shape === "sphere") return { radius: distance };
  if (collider.shape === "capsule") {
    const lengthAxis = collider.axis === "y" ? 1 : collider.axis === "z" ? 2 : 0;
    return axis === lengthAxis
      ? { length: Math.max(MIN_GEOMETRY, distance * 2 - collider.radius * 2) }
      : { radius: distance };
  }
  return axis === 2
    ? { minorRadius: distance }
    : { majorRadius: Math.max(MIN_GEOMETRY, distance - collider.minorRadius) };
}
