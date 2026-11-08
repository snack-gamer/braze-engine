import { expect, it } from "vitest";
import { createEntityWorld, type EntityLifecycleBackend } from "./entity-world";
import type { EntityBatch, WorldEntity } from "../domain/entity-world";
import type { RuntimePrimitive } from "../domain/runtime-primitive";
import { RUNTIME_CHARACTER_CAPABILITIES, type RuntimeCharacter } from "../../character-controller/domain/runtime-character";
import { collisionLayersMatch } from "../../physics/domain/collision-material";

const primitive = (physics?: RuntimePrimitive["physics"]): RuntimePrimitive => ({
  shape: { kind: "box", size: [1, 1, 1] }, position: [0, 2, 0], mass: 1, color: "#ffffff", physics,
});
const character = (physics?: RuntimeCharacter["physics"]): RuntimeCharacter => ({
  position: [0, 2, 0], capsule: { id: "capsule", center: [0, 0.9, 0], radius: 0.35, halfLength: 0.55 },
  render: { shape: { kind: "box", size: [1, 2, 1] }, color: "#ffffff" }, physics,
});
const handle = (batch: EntityBatch, key: string) => {
  const state = batch.read();
  if (state.status !== "committed") throw Error(JSON.stringify(state));
  return state.created[key];
};
function fixture() {
  const prepared: WorldEntity[] = [];
  const backend: EntityLifecycleBackend = { components: RUNTIME_CHARACTER_CAPABILITIES,
    prepare(plan) { prepared.push(...plan.created.map(({ entity }) => entity)); return { publish() {}, rollback() {}, retire() {} }; },
    dispose() {},
  };
  return { ...createEntityWorld({ backend }), prepared };
}

for (const kind of ["primitive", "character"] as const) {
  const descriptor = kind === "primitive" ? primitive : character;
  it(`${kind} creation inherits its layer before the physics backend receives the descriptor`, () => {
    const world = fixture();
    try {
      const ticket = world.port.submit([
        { op: "create", key: "legacy", name: "Legacy", [kind]: descriptor() },
        { op: "create", key: "high", name: "High", layer: 31, [kind]: descriptor({ collisionMask: 0x80000001 }) },
        { op: "create", key: "explicit", name: "Explicit", layer: 8, [kind]: descriptor({ collisionLayer: 0, collisionMask: 1 }) },
      ]);
      world.flush(1);
      expect(world.port.inspect(handle(ticket, "legacy"))).toMatchObject({ layer: 0, [kind]: { physics: { collisionLayer: 0 } } });
      const high = world.port.inspect(handle(ticket, "high"));
      expect(high).toMatchObject({ layer: 31, [kind]: { physics: { collisionLayer: 31, collisionMask: 0x80000001 } } });
      expect(world.port.inspect(handle(ticket, "explicit"))).toMatchObject({ layer: 8, [kind]: { physics: { collisionLayer: 0, collisionMask: 1 } } });
      expect(world.prepared.find((entity) => entity.name === "High")).toBe(high);
      expect(collisionLayersMatch({ collisionLayer: 0, collisionMask: 0x80000000 }, high[kind]!.physics!)).toBe(true);
      expect(collisionLayersMatch({ collisionLayer: 0, collisionMask: 1 }, high[kind]!.physics!)).toBe(false);
    } finally { world.dispose(); }
  });
}

it("captures layer and collision options at submit without changing the caller's descriptor", () => {
  const world = fixture(), physics = { collisionMask: 0x80000000 };
  const source = { op: "create" as const, key: "one", name: "One", layer: 31, primitive: primitive(physics) };
  try {
    const ticket = world.port.submit([source]);
    source.layer = 0; physics.collisionMask = 0;
    world.flush(1);
    expect(world.port.inspect(handle(ticket, "one"))).toMatchObject({ layer: 31, primitive: { physics: { collisionLayer: 31, collisionMask: 0x80000000 } } });
    expect(source.primitive.physics).not.toHaveProperty("collisionLayer");
  } finally { world.dispose(); }
});

it("rejects invalid public creation layers atomically before enqueue", () => {
  const world = fixture();
  try {
    for (const layer of [-1, 32, 1.5, NaN, Infinity]) {
      expect(() => world.port.submit([
        { op: "create", key: "good", name: "Good", layer: 8 },
        { op: "create", key: "bad", name: "Bad", layer },
      ])).toThrow(/layer/i);
    }
    expect(world.port.stats()).toMatchObject({ alive: 0, queuedCommands: 0 });
    expect(world.prepared).toHaveLength(0);
  } finally { world.dispose(); }
});
