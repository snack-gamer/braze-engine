import { expect, it } from "vitest";
import { Vector3, WebGPUCoordinateSystem } from "three";
import { createRenderCamera, applyRenderCameraLens, OrthographicRenderCamera } from "./render-camera";
import { DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";

it("uses native orthographic depth and constant world size at different distances and aspects", () => {
  const camera = createRenderCamera("orthographic");
  expect(camera).toBeInstanceOf(OrthographicRenderCamera);
  camera.coordinateSystem = WebGPUCoordinateSystem; camera.aspect = 2;
  applyRenderCameraLens(camera, { ...DEFAULT_CAMERA_SETTINGS, projection: "orthographic", orthographicSize: 5, near: 1, far: 11 });
  expect(new Vector3(5, 0, -2).project(camera).x).toBeCloseTo(.5);
  expect(new Vector3(5, 0, -10).project(camera).x).toBeCloseTo(.5);
  expect(new Vector3(0, 5, -1).project(camera).y).toBeCloseTo(1);
  expect(new Vector3(0, 0, -1).project(camera).z).toBeCloseTo(0);
  expect(new Vector3(0, 0, -11).project(camera).z).toBeCloseTo(1);
  camera.aspect = .5; camera.updateProjectionMatrix();
  expect(new Vector3(2.5, 0, -5).project(camera).x).toBeCloseTo(1);
});
it("holds the selected FOV axis across resize without changing its authored value", () => {
  const camera = createRenderCamera(); camera.aspect = 2;
  applyRenderCameraLens(camera, { ...DEFAULT_CAMERA_SETTINGS, fov: 90, fovAxis: "horizontal" });
  expect(camera.fov).toBe(90);
  expect(new Vector3(5, 0, -5).project(camera).x).toBeCloseTo(1);
  camera.aspect = .5; camera.updateProjectionMatrix();
  expect(new Vector3(5, 0, -5).project(camera).x).toBeCloseTo(1);
  applyRenderCameraLens(camera, { ...DEFAULT_CAMERA_SETTINGS, fov: 90, fovAxis: "vertical" });
  expect(new Vector3(0, 5, -5).project(camera).y).toBeCloseTo(1);
});
