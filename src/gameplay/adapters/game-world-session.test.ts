import { expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { GameContext } from "../domain/game-module";
import type { Runtime } from "../../three/runtime";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { createGameWorldSession } from "./game-world-session";
import { makeObject } from "../../lib/payload";
vi.mock("../../game-ui/adapters/browser-ui-surface", () => ({ attachBrowserUiSurface: () => () => undefined }));

vi.mock("../../input/adapters/browser-game-input", () => ({ attachBrowserGameInput: () => ({
  port: {}, advance() {}, setEnabled() {}, dispose() {},
}) }));

it("restores an exact legacy camera pose and revokes retained camera commands on Stop", async () => {
  const camera = new PerspectiveCamera(190);
  camera.rotation.set(0.4, 0.8, 0.1);
  const orientation = camera.quaternion.clone();
  const runtime = { camera, controls: { target: new Vector3() }, disposed: false, requestFrame: vi.fn() } as unknown as Runtime;
  let context!: GameContext;
  const session = createGameWorldSession({
    module: { version: 1, create(value) {
      context = value;
      value.camera.setPose({ position: [3, 4, 5], target: [0, 1, 0], fov: 55 });
      return { dispose() {} };
    } }, objects: [], timing: {}, report: vi.fn(),
    renderSession: {} as BrowserThreeWebGpuRenderSession,
  });
  session.attachSurface(runtime, {} as HTMLElement);
  await session.start();
  expect(() => context.characters.move("hero", [1, 0, 0])).toThrow(/fixedUpdate/);
  expect(camera.position.toArray()).toEqual([3, 4, 5]);
  expect(() => context.camera.setPose({ position: [3, 4, 5], target: [0, 1, 0], fov: NaN })).toThrow();
  expect(camera.fov).toBe(55);
  expect(() => session.dispose()).not.toThrow();
  expect(camera.position.toArray()).toEqual([0, 0, 0]);
  expect(camera.quaternion.equals(orientation)).toBe(true);
  expect(camera.fov).toBe(190);
  expect(() => context.camera.setPose({ position: [3, 4, 5], target: [0, 1, 0], fov: 55 })).toThrow(/session has ended/);
});

it("rejects a broken character before waiting for a physics world that cannot start", () => {
  const object = makeObject("cube", 0, { id: "hero" });
  object.characterController = { version: 1, enabled: true, capsuleColliderId: "missing" };
  expect(() => createGameWorldSession({
    module: { version: 1, create: () => ({ dispose() {} }) }, objects: [object], timing: {},
    renderSession: {} as BrowserThreeWebGpuRenderSession, report: vi.fn(),
  })).toThrow(/hero.*Kinematic Rigidbody/);
});

it("keeps bindings and camera commands while replacing a disposed viewport", async () => {
  let context!: GameContext;
  const session = createGameWorldSession({
    module: { version: 1, input: { version: 1, actions: [{ name: "move", kind: "axis", bindings: [] }] }, create(value) {
      context = value; return { dispose() {} };
    } }, objects: [], timing: {}, report: vi.fn(), renderSession: {} as BrowserThreeWebGpuRenderSession,
  });
  const runtime = () => ({ camera: new PerspectiveCamera(), controls: { target: new Vector3() }, disposed: false, requestFrame: vi.fn() }) as unknown as Runtime;
  const first = runtime(), second = runtime();
  const detach = session.attachSurface(first, {} as HTMLElement); await session.start();
  context.input.rebind("move", [{ device: "keyboard", code: "KeyQ" }]);
  first.disposed = true; detach();
  const position: [number, number, number] = [3, 4, 5];
  context.camera.setPose({ position, target: [0, 1, 0], fov: 60 });
  position[0] = 999;
  session.attachSurface(second, {} as HTMLElement);
  expect(context.signal.aborted).toBe(false);
  expect(context.input.bindings().actions[0].bindings).toEqual([{ device: "keyboard", code: "KeyQ", scale: 1 }]);
  expect(second.camera.position.toArray()).toEqual([3, 4, 5]);
  detach(); // An old detach must not remove the replacement surface.
  context.camera.setPose({ position: [4, 5, 6], target: [0, 1, 0], fov: 60 });
  expect(second.camera.position.toArray()).toEqual([4, 5, 6]);
  session.dispose();
  expect(second.camera.position.toArray()).toEqual([0, 0, 0]);
  expect(() => context.input.rebind("move", [])).toThrow(/session has ended/);
});
