import { beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { ActionInput } from "../../input/runtime/action-input";
import type { Runtime } from "../../three/runtime";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { RootMotionPose } from "../../character/runtime/root-motion";
import type { createGameCharacterCommands } from "../../character-controller/adapters/game-character-commands";
import { createCharacterControllerPatch } from "../../character-controller/application/character-controller-authoring";
import { makeObject } from "../../lib/payload";
import { createGameWorldSession } from "./game-world-session";

vi.mock("../../game-ui/adapters/browser-ui-surface", () => ({ attachBrowserUiSurface: () => () => undefined }));

const boundary = vi.hoisted(() => ({ input: undefined as ActionInput | undefined,
  characters: undefined as ReturnType<typeof createGameCharacterCommands> | undefined,
  captures: [] as boolean[], dispose: vi.fn() }));
vi.mock("../../input/adapters/browser-game-input", () => ({ attachBrowserGameInput: (_surface: HTMLElement, input: ActionInput) => {
  boundary.input = input;
  let disposed = false;
  return { port: {}, advance: () => input.advance([]), setEnabled() {},
    dispose() { if (!disposed) { disposed = true; boundary.dispose(); } },
    setPointerLockCapture: (enabled: boolean) => boundary.captures.push(enabled) };
} }));
vi.mock("../../character-controller/adapters/game-character-commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../character-controller/adapters/game-character-commands")>();
  return { createGameCharacterCommands: (...args: Parameters<typeof original.createGameCharacterCommands>) => {
    const commands = original.createGameCharacterCommands(...args); boundary.characters = commands; return commands;
  } };
});
vi.mock("../../three/physics/shared-physics-world", () => ({ physicsWorldForSession: () => physics }));

let pose: RootMotionPose & { grounded: boolean };
const physics = {
  snapshotCharacter: vi.fn((id: string) => id === "hero" ? pose : undefined),
  moveCharacter: vi.fn((id: string, delta: [number, number, number], yawDegrees?: number) => {
    if (id !== "hero") throw new Error("Unexpected character command target.");
    const halfYaw = (yawDegrees ?? 0) * Math.PI / 360;
    pose = { position: [pose.position[0] + delta[0], Math.max(0.85, pose.position[1] + delta[1]), pose.position[2] + delta[2]],
      rotation: [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)], grounded: true };
    return { position: pose.position, grounded: pose.grounded, scope: "static" as const };
  }),
  sweepStaticSphere: vi.fn(() => null),
};
beforeEach(() => {
  vi.clearAllMocks(); boundary.input = undefined; boundary.characters = undefined; boundary.captures.length = 0;
  pose = { position: [0, 0.85, 0], rotation: [0, 0, 0, 1], grounded: true };
});

it.each(["first-person", "third-person", "top-down"])("admits saved %s controls in the first fixed tick without a gameplay entry", async (style) => {
  const hero = makeObject("cube", 0, { id: "hero", position: [0, 0.85, 0] });
  Object.assign(hero, createCharacterControllerPatch(hero));
  hero.behaviors = { version: 1, entries: [{ id: "stock", type: `braze.control.${style}`, typeVersion: 1,
    enabled: true, values: { speed: 3, gravity: 0, mouseSensitivity: 1, pivotHeight: 0.85, sharpness: 0 } }] };
  const authored = structuredClone(hero), report = vi.fn();
  const camera = new PerspectiveCamera(55); camera.position.set(5, 4, 7); camera.rotation.set(0.1, 0.2, 0.3);
  const orientation = camera.quaternion.clone(), target = new Vector3(1, 2, 3);
  const runtime = { camera, controls: { target }, disposed: false, requestFrame: vi.fn() } as unknown as Runtime;
  const session = createGameWorldSession({ module: null, objects: [hero], timing: {}, report,
    renderSession: {} as BrowserThreeWebGpuRenderSession });
  const detach = session.attachSurface(runtime, {} as HTMLElement);
  try {
    session.setInputEnabled(true); await session.start();
    expect(session.status()).toBe("running"); expect(physics.moveCharacter).not.toHaveBeenCalled();
    expect(boundary.captures).toEqual([false]); expect(camera.position.toArray()).toEqual([5, 4, 7]);
    boundary.input!.key("KeyW", true);
    const tick = (index: number) => session.fixedTick({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 });
    expect(tick(1)).toBe(true);
    expect(physics.moveCharacter).toHaveBeenCalledOnce();
    expect(physics.moveCharacter).toHaveBeenLastCalledWith("hero", [0, 0, 0.05], 0);
    expect(boundary.characters!.port.snapshot("hero")?.position[2]).toBeCloseTo(0.05, 12);
    expect(() => boundary.characters!.port.acquire("hero", "Competing script")).toThrow(/owned by/);
    expect(boundary.captures[boundary.captures.length - 1]).toBe(style !== "top-down");
    const firstCamera = camera.position.toArray();
    const distance = style === "first-person" ? 0 : style === "third-person" ? 4 : 8;
    const pitch = (style === "first-person" ? 0 : style === "third-person" ? 20 : 60) * Math.PI / 180;
    const expectedCamera = [0, 1.7 + distance * Math.sin(pitch), 0.05 - distance * Math.cos(pitch)];
    firstCamera.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expectedCamera[index], 12));
    expect(target.toArray()).toEqual([0, 1.7, style === "first-person" ? 1.05 : 0.05]); expect(camera.fov).toBe(60);
    boundary.input!.key("KeyW", false); boundary.input!.pointer(10, 0);
    expect(tick(2)).toBe(true); expect(physics.moveCharacter).toHaveBeenCalledTimes(2);
    expect(boundary.characters!.port.snapshot("hero")?.yawDegrees).toBeCloseTo(style === "first-person" ? 10 : 0, 10);
    if (style === "first-person") expect(target.x).toBeCloseTo(Math.sin(Math.PI / 18), 12);
    else expect(camera.position.toArray()).not.toEqual(firstCamera);
    expect(report).not.toHaveBeenCalled(); expect(hero).toEqual(authored);
  } finally { session.dispose(); detach(); }
  expect(camera.position.toArray()).toEqual([5, 4, 7]); expect(camera.quaternion.equals(orientation)).toBe(true);
  expect(target.toArray()).toEqual([1, 2, 3]); expect(camera.fov).toBe(55);
  expect(boundary.captures[boundary.captures.length - 1]).toBe(false); expect(boundary.dispose).toHaveBeenCalledOnce();
  expect(() => boundary.characters!.port.acquire("hero")).toThrow(/session has ended/);
  expect(session.fixedTick({ index: 3, deltaSeconds: 1 / 60, elapsedSeconds: 3 / 60 })).toBe(false);
  expect(physics.moveCharacter).toHaveBeenCalledTimes(2);
});
