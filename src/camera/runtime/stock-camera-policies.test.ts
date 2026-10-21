import { expect, it } from "vitest";
import { DEFAULT_STOCK_CAMERA_SETTINGS } from "../domain/stock-camera-policy";
import { createFirstPersonCamera, createThirdPersonCamera, createTopDownCamera } from "./stock-camera-policies";

it("produces distinct first-person, orbit and top-down poses using +Z forward and positive-down pitch", () => {
  const position = [3, 1, 2] as const;
  const first = createFirstPersonCamera().sample(position, { yawDegrees: 90, pitchDegrees: 0 }, 1 / 60);
  expect(first.position).toEqual([3, 1.6, 2]);
  expect(first.target[0]).toBeCloseTo(4);
  const third = createThirdPersonCamera().sample(position, { yawDegrees: 0, pitchDegrees: 20 }, 1 / 60);
  expect(third.position[1]).toBeGreaterThan(first.position[1]);
  expect(third.position[2]).toBeLessThan(position[2]);
  const top = createTopDownCamera().sample(position, { yawDegrees: 0, pitchDegrees: 60 }, 1 / 60);
  expect(top.position[1]).toBeGreaterThan(third.position[1]);
  expect(top.target).toEqual(third.target);
  expect(Object.isFrozen(top.position)).toBe(true);
});

it("constrains the smoothed boom every sample and keeps a safe view on initial overlap", () => {
  const pivots: unknown[] = [];
  const camera = createThirdPersonCamera(DEFAULT_STOCK_CAMERA_SETTINGS, (pivot, _position, radius) => {
    pivots.push(pivot); expect(radius).toBe(0.2); return pivot;
  });
  const pose = camera.sample([0, 0, 0], { yawDegrees: 0, pitchDegrees: 20 }, 1 / 60);
  expect(pose.position).toEqual([0, 0.6, 0]);
  expect(pose.target).not.toEqual(pose.position);
  camera.sample([1, 0, 0], { yawDegrees: 0, pitchDegrees: 20 }, 1 / 60);
  expect(pivots).toHaveLength(2);
});

it("captures caller settings, converges across cadence and cuts after reset", () => {
  const run = (hz: number) => {
    const settings = { ...DEFAULT_STOCK_CAMERA_SETTINGS, sharpness: 4 };
    const camera = createThirdPersonCamera(settings); settings.distance = 90;
    camera.sample([0, 0, 0], { yawDegrees: 0, pitchDegrees: 0 }, 0);
    let result;
    for (let i = 0; i < hz; i++) result = camera.sample([10, 0, 0], { yawDegrees: 0, pitchDegrees: 0 }, 1 / hz);
    expect(result!.position[2]).toBe(-4);
    camera.reset(); expect(camera.sample([20, 0, 0], { yawDegrees: 0, pitchDegrees: 0 }, 0).position[0]).toBe(20);
    return result!.position[0];
  };
  expect(run(30)).toBeCloseTo(run(120), 8);
  expect(() => createThirdPersonCamera({ ...DEFAULT_STOCK_CAMERA_SETTINGS, distance: 0 })).toThrow();
  expect(() => createFirstPersonCamera({ ...DEFAULT_STOCK_CAMERA_SETTINGS, fov: NaN })).toThrow();
});
