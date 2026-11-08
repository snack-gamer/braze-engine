import type { Object3D } from "three";
import type { Runtime } from "../../three/runtime";
import { markSceneDirty } from "../../three/runtime";
import { subscribeRuntimeBodyLifecycle } from "../../three/reconciliation/body-lifecycle";
import { cameraIncludesLayer } from "../domain/camera-settings";

type Filter = { mask: number; listeners: Map<object, (mask: number) => void> };
const filters = new WeakMap<Runtime, Filter>();
const bodies = new WeakMap<Object3D, { layer: number; visible: boolean }>();
const cameraMasks = new WeakMap<object, number>();
function filterFor(runtime: Runtime): Filter {
  let filter = filters.get(runtime);
  if (!filter) {
    filter = { mask: 0xffffffff, listeners: new Map() }; filters.set(runtime, filter);
    subscribeRuntimeBodyLifecycle(runtime, (event) => {
      if (event.phase === "willChange" && event.previousBody) forgetCameraCulling(runtime, event.previousBody);
    });
  }
  return filter;
}
export function cameraCullingMask(runtime: Runtime): number { return filters.get(runtime)?.mask ?? 0xffffffff; }
export function renderCameraIncludesLayer(camera: object, layer: number): boolean { return cameraIncludesLayer(cameraMasks.get(camera) ?? 0xffffffff, layer); }
/** Cold edits notify registered render groups. No frame walk or simulation readback. */
export function setCameraCullingMask(runtime: Runtime, mask: number): void {
  const filter = filterFor(runtime); cameraMasks.set(runtime.camera, mask);
  if (filter.mask === mask) return;
  filter.mask = mask;
  for (const update of filter.listeners.values()) update(mask);
  runtime.invalidateShadowCasterMaterials?.(); markSceneDirty(runtime);
}
export function subscribeCameraCulling(runtime: Runtime, key: object, update: (mask: number) => void): () => void {
  const filter = filterFor(runtime); filter.listeners.set(key, update); update(filter.mask);
  return () => { if (filter.listeners.get(key) === update) filter.listeners.delete(key); };
}
export function forgetCameraCulling(runtime: Runtime, key: object): void { filters.get(runtime)?.listeners.delete(key); }
export function renderBodyLayer(body: Object3D): number { return bodies.get(body)?.layer ?? 0; }
/** The body excludes authored child entities, whose layer membership is independent. */
export function assignCameraCullingBody(runtime: Runtime, body: Object3D, layer: number): void {
  const previous = bodies.get(body);
  if (previous?.layer === layer && filters.get(runtime)?.listeners.has(body)) return;
  const state = { layer, visible: previous?.visible ?? body.visible }; bodies.set(body, state);
  subscribeCameraCulling(runtime, body, (mask) => { body.visible = state.visible && cameraIncludesLayer(mask, state.layer); });
}
