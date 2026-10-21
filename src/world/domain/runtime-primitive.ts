export type RuntimeVector3 = readonly [number, number, number];
export type RuntimePrimitiveShape = Readonly<{ kind: "box"; size: RuntimeVector3 }> | Readonly<{ kind: "sphere"; radius: number }>;
export type RuntimePrimitivePhysics = Readonly<{
  useGravity?: boolean; linearDamping?: number; angularDamping?: number;
  friction?: number; restitution?: number; isTrigger?: boolean;
  collisionLayer?: number; collisionMask?: number;
}>;
/** Metres, kilograms, Y-up. Initial state only; live poses remain GPU-resident. */
export type RuntimePrimitive = Readonly<{
  shape: RuntimePrimitiveShape;
  position: RuntimeVector3;
  /** XYZ Euler degrees, matching authored transforms. */
  rotation?: RuntimeVector3;
  collider?: Readonly<{ shape: RuntimePrimitiveShape; center: RuntimeVector3 }>;
  physics?: RuntimePrimitivePhysics;
  velocity?: RuntimeVector3;
  mass: number;
  color: string;
}>;
export const RUNTIME_PRIMITIVE_CAPABILITIES = Object.freeze([
  { id: "transform", requires: [] }, { id: "meshFilter", requires: ["transform"] },
  { id: "meshRenderer", requires: ["meshFilter"] }, { id: "collider", requires: ["transform"] },
  { id: "rigidbody", requires: ["collider", "meshRenderer"] },
].map((item) => Object.freeze({ ...item, requires: Object.freeze(item.requires) })));
export const RUNTIME_PRIMITIVE_COMPONENTS: readonly string[] = Object.freeze(RUNTIME_PRIMITIVE_CAPABILITIES.map((item) => item.id));

/** Capture before enqueue; bound dimensions and magnitude before GPU packing. */
export function captureRuntimePrimitive(value: RuntimePrimitive): RuntimePrimitive {
  const scalar = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const vector = (v: RuntimeVector3, min: number, max: number): RuntimeVector3 => {
    if (!Array.isArray(v) || v.length !== 3 || !Array.from(v).every((n) => scalar(n, min, max))) throw new Error("Runtime primitive requires a bounded 3D vector.");
    return Object.freeze([...v]) as RuntimeVector3;
  };
  if (!value || !scalar(value.mass, 0.001, 1_000_000) || typeof value.color !== "string" || !/^#[\da-f]{6}$/i.test(value.color)) {
    throw new Error("Runtime primitives require positive mass (0.001–1,000,000 kg) and a #rrggbb color.");
  }
  const shape = (input: RuntimePrimitiveShape): RuntimePrimitiveShape => {
    if (input?.kind === "box") return Object.freeze({ kind: "box", size: vector(input.size, 0.01, 1000) });
    if (input?.kind === "sphere" && scalar(input.radius, 0.005, 500)) return Object.freeze({ kind: "sphere", radius: input.radius });
    throw new Error("Runtime creation supports boxes and spheres within 0.01–1,000 metres.");
  };
  if (value.physics !== undefined && (!value.physics || typeof value.physics !== "object" || Array.isArray(value.physics))) throw new Error("Runtime physics options must be an object.");
  const physics: Record<string, unknown> = {};
  const limits = { linearDamping: 1000, angularDamping: 1000, friction: 10, restitution: 1, collisionLayer: 31, collisionMask: 0xffffffff };
  for (const [key, max] of Object.entries(limits)) {
    const v = value.physics?.[key as keyof typeof limits];
    if (v !== undefined && (!scalar(v, 0, max) || (key.startsWith("collision") && !Number.isInteger(v)))) throw new Error(`Invalid runtime physics ${key}.`);
    if (v !== undefined) physics[key] = v;
  }
  for (const key of ["useGravity", "isTrigger"] as const) {
    const v = value.physics?.[key];
    if (v !== undefined && typeof v !== "boolean") throw new Error(`Invalid runtime physics ${key}.`);
    if (v !== undefined) physics[key] = v;
  }
  return Object.freeze({ shape: shape(value.shape), position: vector(value.position, -1_000_000, 1_000_000),
    rotation: vector(value.rotation ?? [0, 0, 0], -360_000, 360_000), physics: Object.freeze(physics),
    collider: value.collider ? Object.freeze({ shape: shape(value.collider.shape), center: vector(value.collider.center, -1000, 1000) }) : undefined,
    velocity: vector(value.velocity ?? [0, 0, 0], -10_000, 10_000), mass: value.mass, color: value.color });
}
