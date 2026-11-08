import { expect, it } from "vitest";
import { captureCameraPatch, captureCameraSettings, DEFAULT_CAMERA_SETTINGS, cameraIncludesLayer } from "./camera-settings";
import { decodeCameraSettings, encodeCameraSettings } from "../serialization/camera-settings-codec";
import { executeObjectCommands } from "../../automation/application/object-commands";
import { makeObject } from "../../lib/payload";

it("migrates old cameras and round-trips all lens, mask and background values", () => {
  const legacy = decodeCameraSettings({ target: [1, 2, 3], fov_degrees: 72, near: .2, far: 600 })!;
  expect(legacy).toMatchObject({ projection: "perspective", fovAxis: "vertical", fov: 72, cullingMask: 0xffffffff });
  const next = { ...legacy, projection: "orthographic" as const, orthographicSize: 12, fovAxis: "horizontal" as const,
    cullingMask: 0x80000000, background: "solid" as const, backgroundColor: "#123456" };
  expect(decodeCameraSettings(encodeCameraSettings(next))).toEqual(next);
  expect(decodeCameraSettings({ near: -2, far: -1, fov_degrees: 360, orthographic_size: 0, culling_mask: -1 }))
    .toMatchObject({ near: .001, far: .002, fov: 179, orthographicSize: .001, cullingMask: 0xffffffff });
});
it("rejects invalid authoring and distinguishes the top layer from Nothing", () => {
  for (const patch of [{ near: 10, far: 1 }, { fov: NaN }, { cullingMask: -1 }, { cullingMask: 1.5 }, { backgroundColor: "red" }]) {
    expect(() => captureCameraSettings({ ...DEFAULT_CAMERA_SETTINGS, ...patch })).toThrow();
  }
  expect(cameraIncludesLayer(0x80000000, 31)).toBe(true);
  expect(cameraIncludesLayer(0x80000000, 0)).toBe(false);
  expect(cameraIncludesLayer(0, 31)).toBe(false);
  expect(() => captureCameraPatch({ constructor: "invalid" })).toThrow(/Unknown camera setting/);
});
it("tools merge camera patches through the shared authoring owner and reject incomplete invalid edits atomically", () => {
  const initial = [makeObject("camera", 0, { id: "camera", camera: { ...DEFAULT_CAMERA_SETTINGS, near: 2, far: 300 } })];
  const result = executeObjectCommands(initial, [{ op: "object.update", id: "camera", values: { camera: { projection: "orthographic", orthographicSize: 3, cullingMask: 0 } } }]);
  expect(result.objects[0].camera).toMatchObject({ near: 2, far: 300, projection: "orthographic", orthographicSize: 3, cullingMask: 0 });
  expect(() => executeObjectCommands(initial, [{ op: "object.update", id: "camera", values: { camera: { far: 1 } } }])).toThrow(/far clipping/);
  expect(initial[0].camera?.far).toBe(300);
  expect(() => executeObjectCommands(initial, [{ op: "object.create", id: "cube", primitive: "cube", values: { camera: { fov: 70 } } }])).toThrow(/Camera object/);
});
