import * as THREE from "three";
import { normalizeCollider } from "../../physics/authoring/component-defaults";
import type { ColliderComponent, SceneObject } from "../../types";
import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import { disposeObject } from "../dispose";
import { markEditorChrome } from "../editor-chrome";
import type { ColliderHandleSelection, Runtime } from "../runtime";
import {
  colliderFacePosition,
  type ColliderFaceAxis,
  type ColliderFaceDirection,
} from "./collider-handle-edit";

const GIZMO_COLOR = 0x7df3ff;

export function colliderHandleKey(selection: ColliderHandleSelection): string {
  return selection.kind === "face"
    ? `${selection.objectId}:${selection.colliderId}:face:${selection.axis}:${selection.direction}`
    : `${selection.objectId}:${selection.colliderId}:center`;
}

export function colliderHandleSelectionFromObject(object: THREE.Object3D): ColliderHandleSelection | null {
  const { objectId, colliderId, colliderHandleKind, colliderHandleAxis, colliderHandleDirection } = object.userData;
  if (typeof objectId !== "string" || typeof colliderId !== "string") return null;
  if (colliderHandleKind === "center") return { objectId, colliderId, kind: "center" };
  if (
    colliderHandleKind === "face" &&
    (colliderHandleAxis === 0 || colliderHandleAxis === 1 || colliderHandleAxis === 2) &&
    (colliderHandleDirection === -1 || colliderHandleDirection === 1)
  ) {
    return {
      objectId,
      colliderId,
      kind: "face",
      axis: colliderHandleAxis,
      direction: colliderHandleDirection,
    };
  }
  return null;
}

export function selectedColliderHandle(runtime: Runtime): THREE.Object3D | undefined {
  return runtime.selectedColliderHandle
    ? runtime.colliderHandleMap.get(colliderHandleKey(runtime.selectedColliderHandle))
    : undefined;
}

function colliderSignature(object: SceneObject): string {
  return JSON.stringify((object.colliders ?? []).map((value, index) => {
    const collider = normalizeCollider(value, object, `${object.id}-collider-${index + 1}`);
    return {
      id: collider.id,
      enabled: collider.enabled,
      shape: collider.shape,
      geometry: collider.geometry,
      axis: collider.axis,
      center: collider.center,
      size: collider.size,
      radius: collider.radius,
      length: collider.length,
      majorRadius: collider.majorRadius,
      minorRadius: collider.minorRadius,
      showGizmo: collider.showGizmo,
    };
  }));
}

function lineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: GIZMO_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false });
}

function buildColliderLine(collider: ColliderComponent): THREE.LineSegments {
  let geometry: THREE.BufferGeometry;
  const rotation = new THREE.Euler();
  if (collider.shape === "mesh") {
    const source = new THREE.BufferGeometry();
    source.setAttribute("position", new THREE.Float32BufferAttribute(collider.geometry?.vertices ?? [], 3));
    source.setIndex(collider.geometry?.indices ?? []); geometry = new THREE.WireframeGeometry(source); source.dispose();
  } else if (collider.shape === "sphere") {
    geometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(collider.radius, 24, 12));
  } else if (collider.shape === "capsule") {
    geometry = new THREE.WireframeGeometry(new THREE.CapsuleGeometry(collider.radius, collider.length, 6, 16));
    if (collider.axis === "x") rotation.z = Math.PI / 2;
    else if (collider.axis === "z") rotation.x = Math.PI / 2;
  } else if (collider.shape === "torus") {
    geometry = new THREE.WireframeGeometry(new THREE.TorusGeometry(collider.majorRadius, collider.minorRadius, 12, 32));
  } else {
    geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(...collider.size));
  }
  const line = new THREE.LineSegments(geometry, lineMaterial());
  line.rotation.copy(rotation);
  line.renderOrder = 48;
  line.raycast = () => undefined;
  return line;
}

function setHandleData(target: THREE.Object3D, selection: ColliderHandleSelection): void {
  target.traverse((child) => {
    child.userData.objectId = selection.objectId;
    child.userData.colliderId = selection.colliderId;
    child.userData.colliderHandleKind = selection.kind;
    if (selection.kind === "face") {
      child.userData.colliderHandleAxis = selection.axis;
      child.userData.colliderHandleDirection = selection.direction;
    }
    markEditorChrome(child);
  });
}

function buildCenterHandle(): THREE.Mesh {
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, toneMapped: false }),
  );
  handle.renderOrder = 50;
  handle.userData.colliderEditVisual = true;
  return handle;
}

function buildFaceHandle(axis: ColliderFaceAxis): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: GIZMO_COLOR,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const scale: [number, number, number] = [0.1, 0.1, 0.1];
  scale[axis] = 0.045;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(...scale), material);
  handle.renderOrder = 50;
  handle.userData.colliderEditVisual = true;
  return handle;
}

const FACE_HANDLES: ReadonlyArray<[ColliderFaceAxis, ColliderFaceDirection]> = [
  [0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1],
];

function registerColliderHandles(runtime: Runtime, root: THREE.Group, object: SceneObject, collider: ColliderComponent): void {
  const geometryTarget = new THREE.Group();
  geometryTarget.name = `${collider.shape} Collider bounds`;
  geometryTarget.position.set(...collider.center);
  geometryTarget.userData.colliderId = collider.id;
  geometryTarget.userData.colliderBoundsVisual = true;
  geometryTarget.add(buildColliderLine(collider));
  markEditorChrome(geometryTarget);
  root.add(geometryTarget);

  const centerSelection: ColliderHandleSelection = { objectId: object.id, colliderId: collider.id, kind: "center" };
  const centerTarget = buildCenterHandle();
  centerTarget.name = `${collider.shape} Collider center`;
  centerTarget.position.set(...collider.center);
  setHandleData(centerTarget, centerSelection);
  runtime.colliderHandleMap.set(colliderHandleKey(centerSelection), centerTarget);
  root.add(centerTarget);

  for (const [axis, direction] of collider.shape === "mesh" ? [] : FACE_HANDLES) {
    const faceSelection: ColliderHandleSelection = {
      objectId: object.id,
      colliderId: collider.id,
      kind: "face",
      axis,
      direction,
    };
    const faceTarget = buildFaceHandle(axis);
    faceTarget.name = `${collider.shape} Collider ${"XYZ"[axis]}${direction > 0 ? "+" : "-"} face`;
    faceTarget.position.set(...colliderFacePosition(collider, axis, direction));
    faceTarget.userData.baseCollider = {
      shape: collider.shape,
      geometry: collider.geometry,
      axis: collider.axis,
      center: [...collider.center],
      size: [...collider.size],
      radius: collider.radius,
      length: collider.length,
      majorRadius: collider.majorRadius,
      minorRadius: collider.minorRadius,
    };
    setHandleData(faceTarget, faceSelection);
    runtime.colliderHandleMap.set(colliderHandleKey(faceSelection), faceTarget);
    root.add(faceTarget);
  }
}

function buildColliderGizmoRoot(runtime: Runtime, object: SceneObject): THREE.Group {
  const root = new THREE.Group();
  root.name = "Collider gizmos";
  root.userData.colliderSignature = colliderSignature(object);
  (object.colliders ?? []).forEach((value, index) => {
    registerColliderHandles(runtime, root, object, normalizeCollider(value, object, `${object.id}-collider-${index + 1}`));
  });
  markEditorChrome(root);
  return root;
}

export function syncColliderGizmoForObject(
  runtime: Runtime,
  node: THREE.Group,
  object: SceneObject,
  editingCollider: ColliderEditSelection | null,
  active: boolean,
  showEditorOverlays: boolean,
  effectivelyVisible: boolean,
): void {
  const shouldExist = (object.colliders?.length ?? 0) > 0;
  let gizmo = runtime.colliderGizmoMap.get(object.id);
  if (!shouldExist) {
    if (gizmo) removeColliderGizmoForObject(runtime, object.id);
    return;
  }
  const signature = colliderSignature(object);
  if (gizmo && gizmo.userData.colliderSignature !== signature) {
    removeColliderGizmoForObject(runtime, object.id);
    gizmo = undefined;
  }
  if (!gizmo) {
    gizmo = buildColliderGizmoRoot(runtime, object);
    runtime.colliderGizmoMap.set(object.id, gizmo);
    node.add(gizmo);
  } else if (gizmo.parent !== node) {
    node.add(gizmo);
  }
  gizmo.visible = showEditorOverlays && effectivelyVisible;
  const colliders = new Map((object.colliders ?? []).map((value, index) => {
    const collider = normalizeCollider(value, object, `${object.id}-collider-${index + 1}`);
    return [collider.id, collider] as const;
  }));
  for (const child of gizmo.children) {
    const colliderId = child.userData.colliderId;
    const collider = typeof colliderId === "string" ? colliders.get(colliderId) : undefined;
    const editing = Boolean(
      active &&
      collider &&
      editingCollider?.objectId === object.id &&
      editingCollider.colliderId === colliderId,
    );
    if (child.userData.colliderBoundsVisual) {
      child.visible = Boolean(collider?.enabled && (collider.showGizmo || editing));
    } else if (child.userData.colliderEditVisual) {
      child.visible = Boolean(collider?.enabled && editing);
    }
  }
}

export function removeColliderGizmoForObject(runtime: Runtime, objectId: string): void {
  const gizmo = runtime.colliderGizmoMap.get(objectId);
  if (gizmo) {
    gizmo.parent?.remove(gizmo);
    disposeObject(gizmo);
    runtime.colliderGizmoMap.delete(objectId);
  }
  for (const [key, handle] of [...runtime.colliderHandleMap]) {
    if (handle.userData.objectId === objectId) runtime.colliderHandleMap.delete(key);
  }
  if (runtime.selectedColliderHandle?.objectId === objectId) runtime.selectedColliderHandle = null;
}
