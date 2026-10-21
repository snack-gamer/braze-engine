import { expect, it } from "vitest";
import { createCharacterLocomotion } from "./character-locomotion";
import type { GameVec3 } from "../../gameplay/domain/game-module";

it("normalizes diagonal speed and jumps only from the ground through the motor", () => {
  let position: GameVec3 = [0, 0, 0];
  const motion = createCharacterLocomotion((delta) => {
    position = [position[0] + delta[0], Math.max(0, position[1] + delta[1]), position[2] + delta[2]];
    return { position, grounded: position[1] === 0, scope: "static" };
  }, { speed: 4, gravity: 9.81, jumpSpeed: 5 });
  motion.step({ x: 1, z: 1, jump: false }, 1 / 60);
  expect(Math.hypot(position[0], position[2])).toBeCloseTo(4 / 60);
  const first = motion.step({ x: 0, z: 0, jump: true }, 1 / 60);
  expect(first.position[1]).toBeGreaterThan(0);
  for (let i = 0; i < 30; i++) motion.step({ x: 0, z: 0, jump: true }, 1 / 60);
  const apex = position[1];
  motion.step({ x: 0, z: 0, jump: true }, 1 / 60);
  expect(position[1]).toBeLessThan(apex);
});

it("integrates free fall consistently at different fixed cadences", () => {
  const fall = (hz: number) => {
    let y = 20;
    const motion = createCharacterLocomotion((d) => ({ position: [0, y += d[1], 0], grounded: false, scope: "static" }));
    for (let i = 0; i < hz; i++) motion.step({ x: 0, z: 0, jump: false }, 1 / hz);
    return y;
  };
  expect(fall(30)).toBeCloseTo(fall(120), 10);
});
