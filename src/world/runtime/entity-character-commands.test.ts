import { expect, it } from "vitest";
import { createEntityWorld, type EntityLifecycleBackend } from "./entity-world";
import { copyEntityCommands } from "./entity-change-plan";
import { RUNTIME_CHARACTER_CAPABILITIES, type RuntimeCharacter } from "../../character-controller/domain/runtime-character";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";

function character() {
  return { position: [1, 2, 3] as [number, number, number], capsule: { id: "capsule", center: [0, 0.9, 0] as [number, number, number], radius: 0.35, halfLength: 0.55 },
    render: { shape: { kind: "box" as const, size: [1, 2, 1] as [number, number, number] }, color: "#ffffff" } } satisfies RuntimeCharacter;
}
const backend: EntityLifecycleBackend = { components: RUNTIME_CHARACTER_CAPABILITIES,
  prepare() { return { publish() {}, rollback() {}, retire() {} }; }, dispose() {} };

it("publishes the independently captured character descriptor and validates backend dependency support", () => {
  const world = createEntityWorld({ backend }), source = character();
  const ticket = world.port.submit([{ op: "create", key: "hero", name: "Hero", character: source }]);
  source.position[0] = 10; source.capsule.radius = 5; source.render.shape.size[0] = 8;
  world.flush(1); const state = ticket.read(); if (state.status !== "committed") throw Error("No character entity");
  const entity = world.port.inspect(state.created.hero);
  expect(entity.character?.position).toEqual([1, 2, 3]); expect(entity.character?.capsule.radius).toBe(0.35);
  expect(entity.character?.render?.shape).toEqual({ kind: "box", size: [1, 2, 1] }); expect(entity.primitive).toBeUndefined();
  const missing = createEntityWorld(), rejected = missing.port.submit([{ op: "create", key: "hero", name: "Hero", character: character() }]);
  missing.flush(1); expect(rejected.read()).toMatchObject({ status: "rejected", code: "unsupported-component" });
  expect(missing.port.stats().alive).toBe(0); world.dispose(); missing.dispose();
});

it("rejects conflicting visuals, dynamic descriptors, absent character data and missing capabilities before enqueue", () => {
  const model = { asset: { guid: "b".repeat(32) }, worldTransform: { position: [1, 2, 3] as const, rotation: [0, 0, 0] as const, scale: [1, 1, 1] as const }, bindings: [], castShadows: true, receiveShadows: true };
  for (const command of [
    { character: { ...character(), render: undefined } }, { character: character(), model },
    { character: character(), primitive: { shape: { kind: "sphere" as const, radius: 1 }, position: [0, 0, 0] as const, mass: 1, color: "#ffffff" } },
    { character: character(), components: ["transform", "meshFilter", "meshRenderer", "collider", "rigidbody"] },
    { components: ["transform", "meshFilter", "meshRenderer", "collider", "rigidbody", "characterController"] },
    { character: { ...character(), render: undefined }, model: { ...model, worldTransform: { ...model.worldTransform, position: [0, 0, 0] as const } } },
  ]) expect(() => copyEntityCommands([{ op: "create", key: "hero", name: "Hero", ...command }])).toThrow();
  expect(() => copyEntityCommands([{ op: "create", key: "hero", name: "Hero", character: { ...character(), render: undefined }, model }])).not.toThrow();
});

it("allows applied yaw on model characters but rejects applied full rotation and dynamic root motion", () => {
  const animator = createDefaultAnimatorComponent(); animator.rootMotion.mode = "applyToObject";
  const model = { asset: { guid: "b".repeat(32) }, worldTransform: { position: [1, 2, 3] as const, rotation: [0, 0, 0] as const, scale: [1, 1, 1] as const }, bindings: [], castShadows: true, receiveShadows: true, animator };
  const command = { op: "create" as const, key: "hero", name: "Hero", character: { ...character(), render: undefined }, model };
  expect(() => copyEntityCommands([command])).not.toThrow();
  animator.rootMotion.rotation = "full";
  expect(() => copyEntityCommands([command])).toThrow(/yaw rotation only/);
  animator.rootMotion.mode = "extractOnly";
  expect(() => copyEntityCommands([command])).not.toThrow();
  animator.rootMotion.mode = "applyToObject";
  expect(() => copyEntityCommands([{ ...command, character: undefined, primitive: { shape: { kind: "sphere", radius: 1 }, position: [1, 2, 3], mass: 1, color: "#ffffff" } }])).toThrow(/root motion cannot apply to a GPU body/);
});
