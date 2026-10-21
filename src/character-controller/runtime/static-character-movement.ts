import type { PhysicsVec3 as Vec } from "../../physics/domain/components";
import type { StaticCapsuleSweep, StaticQueryHit } from "../../physics/runtime/queries/static-query-world";
import type { CharacterMovementSettings } from "../domain/character-movement";

export type CharacterSweep = (query: StaticCapsuleSweep) => StaticQueryHit | null;
export type CharacterMovementResult = Readonly<{
  position: Vec;
  grounded: boolean;
  groundNormal: Vec | null;
  groundObjectId: string | null;
  blocked: boolean;
  stepped: boolean;
}>;
type Input = Readonly<{
  position: Vec; displacement: Vec; radius: number; halfLength: number;
  settings: CharacterMovementSettings; cast: CharacterSweep; objectId: string;
  wasGrounded?: boolean;
}>;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec, b: Vec, scale = 1): Vec => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const down: Vec = [0, -1, 0];

/** Sparse gameplay/root-motion command against authored static geometry. No dynamic pose mirror. */
export function moveStaticCharacter(input: Input): CharacterMovementResult {
  const { settings, radius, halfLength } = input;
  if (![...input.position, ...input.displacement, radius, halfLength].every(Number.isFinite)
    || radius <= 0 || halfLength < 0) throw new Error("Character movement requires finite coordinates and a valid capsule.");
  const slope = Math.cos(settings.maxSlopeDegrees * Math.PI / 180);
  const walkable = (hit: StaticQueryHit | null) => !!hit && hit.normal[1] >= slope;
  const cast = (position: Vec, movement: Vec, separating = true) => {
    const length = Math.hypot(...movement);
    return input.cast({ origin: position, direction: length > 1e-12 ? movement : down,
      maxDistance: length, radius: radius + settings.skinWidth, halfSegment: [0, halfLength, 0],
      excludeObjectId: input.objectId, ignoreInitialSeparating: separating });
  };
  let position: Vec = [...input.position];
  // Recover small initial overlaps, including skin clearance; fail explicitly if enclosed.
  for (let i = 0; i < 8; i++) {
    const hit = cast(position, [0, 0, 0], false);
    if (!hit || hit.penetration < 1e-6) break;
    if (hit.penetration > radius * 2 || i === 7) throw new Error(`Character ${input.objectId} is embedded in static geometry; move its spawn clear.`);
    position = add(position, hit.normal, hit.penetration + 2e-5);
  }
  const initial = cast(position, [0, -settings.groundSnap - 1e-4, 0]);
  const wasGrounded = walkable(initial) || !!(input.wasGrounded && initial && initial.distance < 1e-3 && initial.normal[1] > 0);
  const start: Vec = [...position];
  let remaining: Vec = [...input.displacement], blocked = false;
  for (let i = 0; i < 6 && Math.hypot(...remaining) > 1e-6; i++) {
    const length = Math.hypot(...remaining), hit = cast(position, remaining);
    if (!hit) { position = add(position, remaining); break; }
    blocked = true;
    const fraction = Math.max(0, hit.distance - 2e-5) / length;
    position = add(position, remaining, fraction);
    remaining = remaining.map((v) => v * (1 - fraction)) as Vec;
    let normal: Vec = hit.normal;
    // A steep upward surface acts as a wall for horizontal movement; do not climb it.
    if (normal[1] > 0 && !walkable(hit) && input.displacement[1] <= 0) {
      const horizontal = Math.hypot(normal[0], normal[2]);
      normal = [normal[0] / horizontal, 0, normal[2] / horizontal];
    }
    const inward = dot(remaining, normal);
    if (inward >= -1e-9) break;
    remaining = add(remaining, normal, -inward);
  }
  let stepped = false;
  let stepGround: StaticQueryHit | null = null;
  const horizontal: Vec = [input.displacement[0], 0, input.displacement[2]];
  const horizontalLength = Math.hypot(...horizontal);
  if (blocked && wasGrounded && settings.stepHeight > 0 && input.displacement[1] <= 0 && horizontalLength > 1e-6) {
    const up: Vec = [0, settings.stepHeight, 0];
    if (!cast(start, up)) {
      const raised = add(start, up), forward = cast(raised, horizontal);
      const distance = Math.max(0, Math.min(horizontalLength, forward ? forward.distance - 2e-5 : horizontalLength));
      const over = add(raised, horizontal, distance / horizontalLength);
      const landing = cast(over, [0, -settings.stepHeight - settings.groundSnap, 0]);
      const progress = dot(add(position, start, -1), horizontal) / horizontalLength;
      let support = walkable(landing) ? landing : null;
      // Short per-tick movement first meets the rounded capsule/ledge edge, whose
      // normal can be steep. Confirm a reachable walkable top within one radius.
      if (!support && landing && landing.normal[1] > 0) {
        const ahead = horizontal.map((v) => v * radius / horizontalLength) as Vec;
        if (!cast(over, ahead)) {
          const top = cast(add(over, ahead), [0, -settings.stepHeight - settings.groundSnap, 0]);
          if (walkable(top)) support = top;
        }
      }
      if (support && landing && distance > progress + 1e-4) {
        position = add(over, down, Math.max(0, landing.distance - 2e-5)); stepped = true;
        stepGround = support;
      }
    }
  }
  const snap = input.displacement[1] <= 0 && wasGrounded ? settings.groundSnap : 1e-4;
  const ground = cast(position, [0, -snap - 1e-4, 0]);
  const grounded = input.displacement[1] <= 0 && (walkable(ground) || !!stepGround);
  if (grounded && ground) position = add(position, down, Math.max(0, ground.distance - 2e-5));
  const support = walkable(ground) ? ground : stepGround;
  return { position, grounded, groundNormal: grounded ? support!.normal : null,
    groundObjectId: grounded ? support!.objectId : null, blocked, stepped };
}
