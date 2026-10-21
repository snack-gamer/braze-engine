import { expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createPlayerCameraControls } from "./player-camera-controls";

it("orients the exported player camera toward the authored target without OrbitControls", () => {
  const camera = new PerspectiveCamera(); camera.position.set(5, 4, 7);
  const controls = createPlayerCameraControls(camera); controls.target.set(1, 0, -2);
  expect(controls.update()).toBe(false);
  const expected = controls.target.clone().sub(camera.position).normalize();
  expect(camera.getWorldDirection(new Vector3()).distanceTo(expected)).toBeLessThan(1e-12);
  controls.target.set(-2, 3, 5); controls.update();
  expect(camera.getWorldDirection(new Vector3()).distanceTo(controls.target.clone().sub(camera.position).normalize())).toBeLessThan(1e-12);
});
