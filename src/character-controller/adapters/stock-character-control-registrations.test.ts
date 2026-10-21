import { expect, it, vi } from "vitest";
import type { GameContext } from "../../gameplay/domain/game-module";
import type { RegisteredBehaviorScope } from "../../behaviors/domain/behavior-registration";
import { resolveBehaviorValues, validateBehaviorRegistry } from "../../behaviors/domain/behavior-registry";
import { createStockControlInputMap } from "../../input/domain/stock-control-input-map";
import { createActionInput } from "../../input/runtime/action-input";
import { STOCK_CHARACTER_CONTROL_REGISTRATIONS } from "./stock-character-control-registrations";

function fixture() {
  const cleanups: Array<() => void> = [];
  const characterRelease = vi.fn(), cameraRelease = vi.fn(), gestureRelease = vi.fn();
  const input = createActionInput(createStockControlInputMap());
  const entity = Object.freeze({ world: Symbol(), slot: 0, generation: 1 });
  const acquireCharacter = vi.fn(() => ({ entity, snapshot: () => ({ position: [0, 0, 0] as const, yawDegrees: 0, grounded: true, scope: "static" as const }),
    move: vi.fn(() => ({ position: [0, 0, 0] as const, grounded: true, scope: "static" as const })), release: characterRelease }));
  const acquireCamera = vi.fn(() => ({ setPose: vi.fn(), snapshot: () => null, release: cameraRelease }));
  const capture = vi.fn(() => gestureRelease);
  const context = { input: { ...input, capturePointerLock: capture }, characters: { acquire: acquireCharacter },
    camera: { acquire: acquireCamera, constrain: (_target: unknown, position: readonly [number, number, number]) => position } } as unknown as GameContext;
  const scope: RegisteredBehaviorScope = { entity, signal: new AbortController().signal, defer(cleanup) { cleanups.push(cleanup); }, resolveEntity: () => undefined };
  return { cleanups, characterRelease, cameraRelease, gestureRelease, acquireCharacter, acquireCamera, capture, context, scope };
}

it("registers all three saved versioned styles with bounded distinct defaults", () => {
  const registrations = validateBehaviorRegistry(STOCK_CHARACTER_CONTROL_REGISTRATIONS);
  expect(registrations.map((item) => item.id)).toEqual(["braze.control.first-person", "braze.control.third-person", "braze.control.top-down"]);
  expect(registrations.map((item) => resolveBehaviorValues(item, {}).initialPitch)).toEqual([0, 20, 60]);
  expect(registrations.every((item) => item.fields.length <= 32 && item.version === 1)).toBe(true);
  expect(registrations[0].fields.some((field) => ["distance", "shoulderOffset", "collisionRadius"].includes(field.key))).toBe(false);
  expect(registrations[1].fields.some((field) => field.key === "distance")).toBe(true);
});

it.each([0, 1, 2])("owns/reconstructs style %i resources on enable, disable and disposal", (index) => {
  const f = fixture(), registration = STOCK_CHARACTER_CONTROL_REGISTRATIONS[index];
  const behavior = registration.create(f.scope, resolveBehaviorValues(registration, {}), f.context);
  behavior.onEnable!(); behavior.fixedUpdate!({ index: 1, deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 });
  expect(f.acquireCharacter).toHaveBeenCalledWith(f.scope.entity, registration.label);
  expect(f.acquireCamera).toHaveBeenCalledTimes(1);
  expect(f.capture).toHaveBeenCalledTimes(index === 2 ? 0 : 1);
  behavior.onDisable!(); behavior.onEnable!(); behavior.dispose("detached"); f.cleanups.forEach((cleanup) => cleanup());
  expect(f.acquireCharacter).toHaveBeenCalledTimes(2);
  expect(f.characterRelease).toHaveBeenCalledTimes(2);
  expect(f.cameraRelease).toHaveBeenCalledTimes(2);
  expect(f.gestureRelease).toHaveBeenCalledTimes(index === 2 ? 0 : 2);
});

it("movement-only authoring never claims a camera or pointer gesture", () => {
  const f = fixture(), registration = STOCK_CHARACTER_CONTROL_REGISTRATIONS[0];
  const values = { ...resolveBehaviorValues(registration, { cameraEnabled: false }) };
  const behavior = registration.create(f.scope, values, f.context);
  values.cameraEnabled = true;
  behavior.onEnable!(); behavior.onDisable!(); behavior.dispose("entity-removed");
  expect(f.acquireCamera).not.toHaveBeenCalled(); expect(f.capture).not.toHaveBeenCalled();
  expect(f.characterRelease).toHaveBeenCalledTimes(1);
});

it("failed camera admission releases character ownership once and allows deferred cleanup", () => {
  const f = fixture(), registration = STOCK_CHARACTER_CONTROL_REGISTRATIONS[1];
  f.acquireCamera.mockImplementation(() => { throw new Error("Camera owned"); });
  const behavior = registration.create(f.scope, resolveBehaviorValues(registration, {}), f.context);
  expect(() => behavior.onEnable!()).toThrow("Camera owned");
  behavior.dispose("failed"); f.cleanups.forEach((cleanup) => cleanup());
  expect(f.characterRelease).toHaveBeenCalledTimes(1); expect(f.capture).not.toHaveBeenCalled();
});

it("cleanup keeps releasing movement and gestures if camera release fails", () => {
  const f = fixture(), registration = STOCK_CHARACTER_CONTROL_REGISTRATIONS[0];
  f.cameraRelease.mockImplementation(() => { throw new Error("Camera cleanup failed"); });
  const behavior = registration.create(f.scope, resolveBehaviorValues(registration, {}), f.context);
  behavior.onEnable!(); expect(() => behavior.onDisable!()).toThrow("Camera cleanup failed");
  behavior.dispose("failed"); f.cleanups.forEach((cleanup) => cleanup());
  expect(f.gestureRelease).toHaveBeenCalledTimes(1); expect(f.characterRelease).toHaveBeenCalledTimes(1);
});
