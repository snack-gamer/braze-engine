import * as THREE from "three";
import type { ObjectModifier, SceneObject } from "../../types";
import { disposeObject } from "../dispose";
import { markEditorChrome } from "../editor-chrome";
import type { ModifierHandleSelection, Runtime } from "../runtime";

const HANDLE_SCALE = 0.14;

function handleKey(objectId: string, modifierId: string, pinId: string): string {
  return `${objectId}:${modifierId}:${pinId}`;
}

function buildPinHandle(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "Buoyancy pin";

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.08, 8, 28),
    new THREE.MeshBasicMaterial({
      color: 0x7df3ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  group.add(ring, stem, dot);
  group.scale.setScalar(HANDLE_SCALE);
  group.renderOrder = 50;
  markEditorChrome(group);
  group.traverse((child) => {
    child.renderOrder = 50;
    markEditorChrome(child);
  });
  return group;
}

function setHandleData(handle: THREE.Object3D, objectId: string, modifierId: string, pinId: string): void {
  handle.userData.objectId = objectId;
  handle.userData.modifierHandle = true;
  handle.userData.modifierId = modifierId;
  handle.userData.pinId = pinId;
  handle.traverse((child) => {
    child.userData.objectId = objectId;
    child.userData.modifierHandle = true;
    child.userData.modifierId = modifierId;
    child.userData.pinId = pinId;
  });
}

function syncBuoyancyHandles(
  runtime: Runtime,
  node: THREE.Group,
  object: SceneObject,
  modifier: Extract<ObjectModifier, { type: "buoyancy" }>,
  active: boolean,
  showEditorOverlays: boolean,
  liveKeys: Set<string>,
): void {
  for (const pin of modifier.pins) {
    const key = handleKey(object.id, modifier.id, pin.id);
    liveKeys.add(key);
    let handle = runtime.modifierHandleMap.get(key);
    if (!handle) {
      handle = buildPinHandle();
      setHandleData(handle, object.id, modifier.id, pin.id);
      runtime.modifierHandleMap.set(key, handle);
      node.add(handle);
    } else if (handle.parent !== node) {
      node.add(handle);
    }
    handle.name = `${modifier.name || "Buoyancy"} ${pin.name || "Pin"}`;
    handle.position.set(pin.localOffset[0], pin.localOffset[1], pin.localOffset[2]);
    const gizmoScale = THREE.MathUtils.clamp(modifier.pinGizmoScale ?? 1, 0.25, 3);
    handle.scale.setScalar(HANDLE_SCALE * gizmoScale);
    handle.visible = showEditorOverlays && object.visible && active && modifier.enabled && modifier.showPinGizmos !== false;
    handle.userData.pinName = pin.name;
  }
}

export function syncModifierHandlesForObject(
  runtime: Runtime,
  node: THREE.Group,
  object: SceneObject,
  active: boolean,
  showEditorOverlays: boolean,
): void {
  const liveKeys = new Set<string>();
  for (const modifier of object.modifiers ?? []) {
    if (modifier.type === "buoyancy") {
      syncBuoyancyHandles(runtime, node, object, modifier, active, showEditorOverlays, liveKeys);
    }
  }

  for (const [key, handle] of [...runtime.modifierHandleMap]) {
    if (handle.userData.objectId !== object.id || liveKeys.has(key)) continue;
    handle.parent?.remove(handle);
    disposeObject(handle);
    runtime.modifierHandleMap.delete(key);
  }
}

export function removeModifierHandlesForObject(runtime: Runtime, objectId: string): void {
  for (const [key, handle] of [...runtime.modifierHandleMap]) {
    if (handle.userData.objectId !== objectId) continue;
    handle.parent?.remove(handle);
    disposeObject(handle);
    runtime.modifierHandleMap.delete(key);
  }
  if (runtime.selectedModifierHandle?.objectId === objectId) runtime.selectedModifierHandle = null;
}

export function selectedModifierHandle(runtime: Runtime): THREE.Object3D | undefined {
  const selected = runtime.selectedModifierHandle;
  if (!selected) return undefined;
  return runtime.modifierHandleMap.get(handleKey(selected.objectId, selected.modifierId, selected.pinId));
}

export function handleSelectionFromObject(object: THREE.Object3D): ModifierHandleSelection | null {
  const data = object.userData;
  if (!data.modifierHandle) return null;
  if (typeof data.objectId !== "string" || typeof data.modifierId !== "string" || typeof data.pinId !== "string") {
    return null;
  }
  return {
    objectId: data.objectId,
    modifierId: data.modifierId,
    pinId: data.pinId,
  };
}

export function modifierHandleKey(selection: ModifierHandleSelection): string {
  return handleKey(selection.objectId, selection.modifierId, selection.pinId);
}
