import { DEFAULT_COLLISION_MATERIAL } from "../../physics/domain/collision-material";
import type { RuntimePrimitiveShape, RuntimeVector3 } from "../../world/domain/runtime-primitive";
import { DEFAULT_CHARACTER_MOVEMENT, type CharacterMovementSettings } from "./character-movement";

export type RuntimeCharacterPhysics = Readonly<{
  linearDamping?: number; angularDamping?: number; friction?: number; restitution?: number;
  collisionLayer?: number; collisionMask?: number;
}>;

/** Initial Y-up command pose and world-scaled solid capsule. Gravity is caller-owned. */
export type RuntimeCharacter = Readonly<{
  position: RuntimeVector3;
  /** XYZ Euler degrees; only yaw is supported. */
  rotation?: RuntimeVector3;
  capsule: Readonly<{ id: string; center: RuntimeVector3; radius: number; halfLength: number }>;
  movement?: CharacterMovementSettings;
  physics?: RuntimeCharacterPhysics;
  /** Rendering only; an imported model is supplied separately on the entity. */
  render?: Readonly<{ shape: RuntimePrimitiveShape; color: string }>;
}>;

export const RUNTIME_CHARACTER_CAPABILITIES = Object.freeze([
  { id: "transform", requires: [] }, { id: "meshFilter", requires: ["transform"] },
  { id: "meshRenderer", requires: ["meshFilter"] }, { id: "collider", requires: ["transform"] },
  { id: "rigidbody", requires: ["collider", "meshRenderer"] },
  { id: "characterController", requires: ["rigidbody", "collider"] },
].map((item) => Object.freeze({ ...item, requires: Object.freeze(item.requires) })));
export const RUNTIME_CHARACTER_COMPONENTS: readonly string[] = Object.freeze(RUNTIME_CHARACTER_CAPABILITIES.map((item) => item.id));

/** Capture before enqueue, with no dynamic-body options or live runtime identity. */
export function captureRuntimeCharacter(value: RuntimeCharacter): RuntimeCharacter & Readonly<{ movement: CharacterMovementSettings }> {
  const scalar = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const vector = (input: RuntimeVector3, min: number, max: number): RuntimeVector3 => {
    if (!Array.isArray(input) || input.length !== 3 || !Array.from(input).every((n) => scalar(n, min, max))) throw new Error("Runtime characters require bounded three-dimensional vectors.");
    return Object.freeze([...input]) as RuntimeVector3;
  };
  const record = (input: unknown, fields: readonly string[], label: string): Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !fields.includes(key))) throw new Error(`Invalid runtime character ${label}.`);
    return input as Record<string, unknown>;
  };
  record(value, ["position", "rotation", "capsule", "movement", "physics", "render"], "descriptor");
  const capsule = record(value.capsule, ["id", "center", "radius", "halfLength"], "capsule");
  if (typeof capsule.id !== "string" || !capsule.id.trim() || capsule.id.length > 256
    || !scalar(capsule.radius, 0.005, 500) || !scalar(capsule.halfLength, 0.0005, 500)) throw new Error("Runtime characters require a named, positive capsule within supported dimensions.");
  const rotation = vector(value.rotation ?? [0, 0, 0], -360_000, 360_000);
  if (Math.abs(rotation[0]) > 1e-6 || Math.abs(rotation[2]) > 1e-6) throw new Error("Runtime character rotation supports upright yaw only.");
  const movement = value.movement ?? DEFAULT_CHARACTER_MOVEMENT;
  record(movement, ["skinWidth", "stepHeight", "groundSnap", "maxSlopeDegrees"], "movement settings");
  if (!scalar(movement.skinWidth, 0.001, 0.2) || !scalar(movement.stepHeight, 0, 2)
    || !scalar(movement.groundSnap, 0, 2) || !scalar(movement.maxSlopeDegrees, 0, 89)) throw new Error("Invalid runtime character movement settings.");
  const physics = value.physics ?? {};
  record(physics, ["linearDamping", "angularDamping", "friction", "restitution", "collisionLayer", "collisionMask"], "physics settings");
  const defaults = { linearDamping: 0, angularDamping: 0, friction: 0, ...DEFAULT_COLLISION_MATERIAL };
  const capturedPhysics = { ...defaults, ...Object.fromEntries(Object.entries(physics).filter(([, n]) => n !== undefined)) };
  for (const [key, limit] of Object.entries({ linearDamping: 1000, angularDamping: 1000, friction: 10, restitution: 1, collisionLayer: 31, collisionMask: 0xffffffff })) {
    const n = capturedPhysics[key as keyof typeof capturedPhysics];
    if (!scalar(n, 0, limit) || (key.startsWith("collision") && !Number.isInteger(n))) throw new Error(`Invalid runtime character ${key}.`);
  }
  let render: RuntimeCharacter["render"];
  if (value.render !== undefined) {
    record(value.render, ["shape", "color"], "rendering");
    if (typeof value.render.color !== "string" || !/^#[\da-f]{6}$/i.test(value.render.color)) throw new Error("Runtime character rendering requires a #rrggbb color.");
    const shape = value.render.shape;
    if (shape?.kind === "box") {
      record(shape, ["kind", "size"], "render shape");
      render = Object.freeze({ color: value.render.color, shape: Object.freeze({ kind: "box", size: vector(shape.size, 0.01, 1000) }) });
    } else if (shape?.kind === "sphere" && scalar(shape.radius, 0.005, 500)) {
      record(shape, ["kind", "radius"], "render shape");
      render = Object.freeze({ color: value.render.color, shape: Object.freeze({ kind: "sphere", radius: shape.radius }) });
    } else throw new Error("Runtime character rendering supports bounded boxes and spheres.");
  }
  return Object.freeze({ position: vector(value.position, -1_000_000, 1_000_000),
    rotation: Object.freeze([0, rotation[1], 0]) as RuntimeVector3,
    capsule: Object.freeze({ id: capsule.id, center: vector(value.capsule.center, -1000, 1000), radius: capsule.radius, halfLength: capsule.halfLength }),
    movement: Object.freeze({ ...movement }), physics: Object.freeze(capturedPhysics), ...(render ? { render } : {}) });
}
