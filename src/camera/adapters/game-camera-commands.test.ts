import { expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Runtime } from "../../three/runtime";
import { createGameCameraSurface } from "../../gameplay/adapters/game-camera-surface";
import { createGameCameraCommands } from "./game-camera-commands";

const pose = { position: [0, 2, 5], target: [0, 1, 0], fov: 60 } as const;
function harness() {
  const signal = new AbortController(), surface = createGameCameraSurface(), sweep = vi.fn(() => null as { distance: number } | null);
  const runtime = { camera: new PerspectiveCamera(45), controls: { target: new Vector3() }, requestFrame: vi.fn(), disposed: false } as unknown as Runtime;
  surface.attach(runtime);
  const camera = createGameCameraCommands({ signal: signal.signal, surface, sweep });
  return { signal, surface, sweep, runtime, camera };
}

it("retains immutable command snapshots and restores the authored camera on policy release", () => {
  const h = harness(), lease = h.camera.acquire("FPS");
  lease.setPose(pose);
  const captured = lease.snapshot()!;
  expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.position)).toBe(true);
  expect(h.runtime.camera.position.toArray()).toEqual(pose.position);
  expect(() => h.camera.acquire("TPS")).toThrow(/already owned.*FPS/);
  expect(() => h.camera.setPose(pose)).toThrow(/owned.*FPS/);
  lease.release(); lease.release();
  expect(h.camera.snapshot()).toBeNull(); expect(h.runtime.camera.position.toArray()).toEqual([0, 0, 0]);
  expect(h.runtime.camera.fov).toBe(45);
  expect(() => lease.setPose(pose)).toThrow(/released/);
  const replacement = h.camera.acquire("Custom"); replacement.setPose(pose); lease.release();
  expect(replacement.snapshot()).toEqual(pose); replacement.release(); h.surface.dispose();
});

it("revokes retained camera leases and commands when the world ends", () => {
  const h = harness(), lease = h.camera.acquire(); lease.setPose(pose); h.signal.abort();
  expect(h.runtime.camera.position.toArray()).toEqual([0, 0, 0]);
  expect(() => lease.snapshot()).toThrow(/session has ended/);
  expect(() => h.camera.acquire()).toThrow(/session has ended/);
  expect(() => h.camera.setPose(pose)).toThrow(/session has ended/);
  expect(() => lease.release()).not.toThrow(); h.surface.dispose();
});

it("restores each view's baseline and ignores old detachers and released owners after replacement", () => {
  const surface = createGameCameraSurface(), signal = new AbortController();
  const view = (x: number, fov: number) => {
    const camera = new PerspectiveCamera(fov); camera.position.set(x, 2, 3); camera.rotation.set(0.1, 0.2, 0.3);
    return { camera, controls: { target: new Vector3(x, 1, 0) }, requestFrame: vi.fn(), disposed: false } as unknown as Runtime;
  };
  const first = view(1, 45), second = view(10, 55), firstOrientation = first.camera.quaternion.clone(), secondOrientation = second.camera.quaternion.clone();
  const detachFirst = surface.attach(first), camera = createGameCameraCommands({ signal: signal.signal, surface, sweep: () => null });
  const original = camera.acquire("First"); original.setPose(pose);
  const detachSecond = surface.attach(second);
  expect(first.camera.position.toArray()).toEqual([1, 2, 3]); expect(first.camera.quaternion.equals(firstOrientation)).toBe(true);
  detachFirst(); expect(second.camera.position.toArray()).toEqual(pose.position);
  original.release();
  expect(second.camera.position.toArray()).toEqual([10, 2, 3]); expect(second.controls.target.toArray()).toEqual([10, 1, 0]);
  expect(second.camera.quaternion.equals(secondOrientation)).toBe(true); expect(second.camera.fov).toBe(55);
  const replacement = camera.acquire("Second"); replacement.setPose(pose); original.release();
  expect(second.camera.position.toArray()).toEqual(pose.position);
  detachSecond(); detachSecond(); expect(second.camera.position.toArray()).toEqual([10, 2, 3]);
  surface.attach(first); expect(first.camera.position.toArray()).toEqual(pose.position);
  replacement.release(); expect(first.camera.position.toArray()).toEqual([1, 2, 3]);
  signal.abort(); surface.dispose();
});

it("constrains a static camera boom with clearance and handles initial overlap", () => {
  const h = harness();
  h.sweep.mockReturnValue({ distance: 2 });
  expect(h.camera.constrain([0, 1, 0], [0, 1, 5], 0.2)).toEqual([0, 1, 1.98]);
  expect(h.sweep).toHaveBeenLastCalledWith({ origin: [0, 1, 0], direction: [0, 0, 5], maxDistance: 5, radius: 0.2 });
  h.sweep.mockReturnValue({ distance: 0 });
  expect(h.camera.constrain([0, 1, 0], [0, 1, 5], 0.2)).toEqual([0, 1, 0]);
  h.sweep.mockReturnValue(null);
  expect(h.camera.constrain([0, 1, 0], [0, 1, 5], 0.2)).toEqual([0, 1, 5]);
  expect(() => h.camera.constrain([NaN, 0, 0], [0, 1, 5], 0.2)).toThrow();
  expect(() => h.camera.constrain([0, 1, 0], [0, 1, 5], -1)).toThrow(); h.surface.dispose();
});
