import { expect, it } from "vitest";
import { createActionInput } from "../../input/runtime/action-input";
import { createStockControlInputMap } from "../../input/domain/stock-control-input-map";
import { decodeInputActionMap } from "../../input/serialization/action-map-codec";
import type { GameCharacterPose } from "../domain/game-character-commands";
import type { GameCameraPose } from "../../gameplay/domain/game-module";
import { DEFAULT_CHARACTER_CONTROL_SETTINGS } from "../domain/character-control-settings";
import { createCharacterControlLook } from "./character-control-look";
import { createCharacterControlPolicy } from "./character-control-policy";
import { createFirstPersonControl, createThirdPersonControl, createTopDownControl } from "./stock-character-controls";

function fixture() {
  const input = createActionInput(createStockControlInputMap());
  let pose: GameCharacterPose = { position: [0, 0, 0], yawDegrees: 0, grounded: true, scope: "static" };
  let cameraPose: GameCameraPose | undefined;
  const calls: string[] = [];
  const ports = { input, movement: {
    snapshot: () => pose,
    move(delta: readonly [number, number, number], options?: Readonly<{ yawDegrees?: number }>) {
      calls.push("move");
      pose = { ...pose, yawDegrees: options?.yawDegrees ?? pose.yawDegrees,
        position: [pose.position[0] + delta[0], Math.max(0, pose.position[1] + delta[1]), pose.position[2] + delta[2]] };
      return pose;
    },
  }, camera: { setPose(value: GameCameraPose) { calls.push("camera"); cameraPose = value; } } };
  return { input, ports, calls, pose: () => pose, camera: () => cameraPose };
}

it("preserves pixel look and integrates normalized look rates across fixed cadences", () => {
  const run = (hz: number) => {
    const look = createCharacterControlLook(DEFAULT_CHARACTER_CONTROL_SETTINGS.look);
    let result;
    for (let i = 0; i < hz; i++) result = look.step({ deltaX: i === 0 ? 100 : 0, deltaY: 0, rateX: 0.5, rateY: 0 }, 1 / hz);
    return result!;
  };
  expect(run(30).yawDegrees).toBeCloseTo(72, 8);
  expect(run(120)).toEqual(run(30));
  const look = createCharacterControlLook(DEFAULT_CHARACTER_CONTROL_SETTINGS.look);
  expect(look.step({ deltaX: 0, deltaY: 2048, rateX: 0, rateY: 0 }, 1 / 60).pitchDegrees).toBe(85);
  look.reset(90); expect(look.step({ deltaX: 0, deltaY: 0, rateX: 0, rateY: 0 }, 1 / 60).yawDegrees).toBe(90);
  expect(() => look.step({ deltaX: NaN, deltaY: 0, rateX: 0, rateY: 0 }, 1 / 60)).toThrow();
});

it.each([createFirstPersonControl, createThirdPersonControl, createTopDownControl])("runs orientation before movement and camera against the new constrained pose", (create) => {
  const f = fixture();
  const policy = create(f.ports, { look: { initialPitch: 0, pitchMin: -85, pitchMax: 85 }, camera: { sharpness: 0 } });
  f.input.key("KeyW", true); f.input.pointer(750, 0); f.input.advance();
  const result = policy.step(1 / 60)!;
  expect(result.orientation.yawDegrees).toBe(90);
  expect(f.pose().position[0]).toBeCloseTo(4 / 60);
  expect(f.pose().position[2]).toBeCloseTo(0);
  expect(f.pose().yawDegrees).toBeCloseTo(90);
  expect(f.calls).toEqual(["move", "camera"]);
  expect(f.camera()!.target[0]).toBeGreaterThanOrEqual(result.movement.position[0]);
  expect(result.movement.scope).toBe("static");
});

it("lets scripts supply facing and camera policies and resets captured config independently", () => {
  const f = fixture();
  const settings = { ...DEFAULT_CHARACTER_CONTROL_SETTINGS, look: { ...DEFAULT_CHARACTER_CONTROL_SETTINGS.look } };
  const camera = { sample() { f.calls.push("sample"); return { position: [2, 3, 4] as const, target: [0, 1, 0] as const, fov: 70 }; }, reset() {} };
  const policy = createCharacterControlPolicy(f.ports, settings, camera, () => 45);
  settings.look.mouseSensitivity = 4;
  policy.reset(); f.input.pointer(100, 0); f.input.advance();
  expect(policy.step(1 / 60)!.orientation.yawDegrees).toBe(12);
  expect(f.pose().yawDegrees).toBe(45);
  expect(f.calls).toEqual(["move", "sample", "camera"]);
  expect(f.camera()!.fov).toBe(70);
});

it("keeps TPS/top-down idle facing and supports movement without a camera port", () => {
  const f = fixture();
  const { camera: _camera, ...ports } = f.ports;
  const policy = createThirdPersonControl(ports);
  f.input.key("KeyD", true); f.input.advance(); policy.step(1 / 60);
  f.input.key("KeyD", false); f.input.pointer(100, 0); f.input.advance();
  expect(policy.step(1 / 60)!.camera).toBeNull();
  expect(f.pose().yawDegrees).toBeCloseTo(90);
  expect(f.calls).toEqual(["move", "move"]);
});

it("rejects missing/wrong-kind actions and produces independent immutable valid starter maps", () => {
  const first = createStockControlInputMap(), second = createStockControlInputMap();
  expect(decodeInputActionMap(first).actions.map(({ name, kind }) => [name, kind])).toEqual([
    ["moveX", "axis"], ["moveZ", "axis"], ["jump", "button"], ["lookX", "delta"], ["lookY", "delta"],
    ["lookRateX", "axis"], ["lookRateY", "axis"],
  ]);
  expect(first).not.toBe(second);
  expect(Object.isFrozen(first.actions[0].bindings[0])).toBe(true);
  const f = fixture();
  expect(() => createFirstPersonControl({ ...f.ports, input: { action: f.input.action, bindings: () => ({ version: 1, actions: [] }) } })).toThrow("must exist");
  expect(() => createFirstPersonControl(f.ports, { actions: { jump: "moveX" } })).toThrow("button");
  expect(() => createFirstPersonControl(f.ports, { look: { pitchMin: 10, initialPitch: 0 } })).toThrow("look settings");
});
