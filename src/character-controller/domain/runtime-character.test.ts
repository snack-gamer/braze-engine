import { expect, it } from "vitest";
import { captureRuntimeCharacter, type RuntimeCharacter } from "./runtime-character";
import { DEFAULT_CHARACTER_MOVEMENT } from "./character-movement";

function character() {
  return { position: [1, 2, 3] as [number, number, number], rotation: [0, 90, 0] as [number, number, number],
    capsule: { id: "capsule", center: [0, 0.9, 0] as [number, number, number], radius: 0.35, halfLength: 0.55 },
    render: { shape: { kind: "box" as const, size: [1, 2, 1] as [number, number, number] }, color: "#ffffff" } } satisfies RuntimeCharacter;
}

it("captures a solid yaw-only character independently of mutable caller data", () => {
  const source = character(), captured = captureRuntimeCharacter(source);
  source.position[0] = 9; source.capsule.center[1] = 5; source.render.shape.size[1] = 8;
  expect(captured.position).toEqual([1, 2, 3]); expect(captured.capsule.center).toEqual([0, 0.9, 0]);
  expect(captured.render?.shape).toEqual({ kind: "box", size: [1, 2, 1] });
  expect(captured.movement).toEqual(DEFAULT_CHARACTER_MOVEMENT);
  expect(captured.physics).toMatchObject({ friction: 0, restitution: 0, collisionLayer: 0, collisionMask: 0xffffffff });
  for (const item of [captured, captured.position, captured.rotation, captured.capsule, captured.capsule.center, captured.movement, captured.physics, captured.render, captured.render?.shape]) expect(Object.isFrozen(item)).toBe(true);
});

it("rejects nonfinite, tilted, oversized and dynamic-only character data", () => {
  for (const source of [
    { ...character(), position: [Infinity, 0, 0] }, { ...character(), rotation: [1, 0, 0] },
    { ...character(), capsule: { ...character().capsule, radius: 0 } },
    { ...character(), capsule: { ...character().capsule, id: " " } },
    { ...character(), capsule: { ...character().capsule, halfLength: 501 } },
    { ...character(), physics: { isTrigger: true } }, { ...character(), mass: 1 },
    { ...character(), movement: { ...DEFAULT_CHARACTER_MOVEMENT, stepHeight: -1 } },
    { ...character(), physics: { collisionLayer: 1.5 } }, { ...character(), physics: { collisionMask: 0x100000000 } },
    { ...character(), render: { ...character().render, shape: { kind: "capsule", radius: 1 } } },
  ]) expect(() => captureRuntimeCharacter(source as RuntimeCharacter)).toThrow();
});

it("preserves authored zeros and nondefault collision/movement settings", () => {
  const captured = captureRuntimeCharacter({ ...character(), movement: { ...DEFAULT_CHARACTER_MOVEMENT, stepHeight: 0, groundSnap: 0 },
    physics: { friction: 0.8, restitution: 0.2, collisionLayer: 3, collisionMask: 7, linearDamping: 0, angularDamping: 0 } });
  expect(captured.movement).toMatchObject({ stepHeight: 0, groundSnap: 0 });
  expect(captured.physics).toMatchObject({ friction: 0.8, restitution: 0.2, collisionLayer: 3, collisionMask: 7 });
});
