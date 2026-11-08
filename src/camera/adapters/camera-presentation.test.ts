import { expect, it, vi } from "vitest";
import { Scene, Texture, Vector3 } from "three";
import type { Runtime } from "../../three/runtime";
import { DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";
import { createRenderCamera } from "./render-camera";
import { applyCameraPresentation, withCameraBackground } from "./camera-presentation";
import { createGameCameraSurface } from "../../gameplay/adapters/game-camera-surface";

it("overrides only the display background and restores sky and IBL after errors", () => {
  const scene = new Scene(), environment = new Texture(); scene.background = environment; scene.environment = environment;
  const sky = { setBackgroundVisible: vi.fn() }, pipeline = { setCameraBackground: vi.fn() };
  const runtime = { scene, camera: createRenderCamera(), sky, renderPipeline: pipeline, disposed: false } as unknown as Runtime;
  applyCameraPresentation(runtime, { ...DEFAULT_CAMERA_SETTINGS, background: "solid", backgroundColor: "#aabbcc" });
  expect(pipeline.setCameraBackground).toHaveBeenCalledWith(false);
  expect(() => withCameraBackground(runtime, () => { expect(scene.background).not.toBe(environment); expect(scene.environment).toBe(environment); throw Error("draw"); })).toThrow("draw");
  expect(scene.background).toBe(environment); expect(sky.setBackgroundVisible.mock.calls).toEqual([[false], [true]]);
});
it("scripted orthographic zoom changes projection and releases back to authored size", () => {
  const camera = createRenderCamera("orthographic"), runtime = { camera, controls: { target: new Vector3() }, disposed: false } as unknown as Runtime;
  applyCameraPresentation(runtime, { ...DEFAULT_CAMERA_SETTINGS, projection: "orthographic", orthographicSize: 8 });
  const surface = createGameCameraSurface(); surface.attach(runtime);
  surface.setPose({ position: [0, 0, 10], target: [0, 0, 0], fov: 52, lens: { orthographicSize: 2 } });
  expect(new Vector3(0, 2, -5).project(camera).y).toBeCloseTo(1);
  surface.clear(); camera.updateMatrixWorld(); expect(new Vector3(0, 8, -5).project(camera).y).toBeCloseTo(1);
  surface.dispose();
});
