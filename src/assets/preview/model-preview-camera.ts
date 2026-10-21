import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { calculateModelPreviewFrame } from "./model-preview-frame";
import { MODEL_PREVIEW_FIELD_OF_VIEW } from "./model-preview-stage";

const FRAME_PADDING = 1.14;
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(1, 0.62, 1).normalize();

export function frameModelPreviewCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Sphere,
): void {
  const frame = calculateModelPreviewFrame({
    radius: bounds.radius,
    aspect: camera.aspect,
    verticalFovDegrees: MODEL_PREVIEW_FIELD_OF_VIEW,
    padding: FRAME_PADDING,
  });
  camera.zoom = 1;
  camera.position.copy(bounds.center).addScaledVector(DEFAULT_VIEW_DIRECTION, frame.distance);
  camera.near = Math.max(bounds.radius * 1e-3, Math.min(frame.near, frame.distance - bounds.radius * 2));
  camera.far = Math.max(frame.far, frame.distance + bounds.radius * 8);
  camera.updateProjectionMatrix();
  controls.target.copy(bounds.center);
  controls.cursor.copy(bounds.center);
  controls.minDistance = bounds.radius * 0.12;
  controls.maxDistance = Math.max(frame.distance * 8, bounds.radius * 32);
  controls.minTargetRadius = 0;
  controls.maxTargetRadius = bounds.radius * 4;
  controls.update();
  controls.saveState();
}

export function updateModelPreviewClippingPlanes(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Sphere,
): void {
  const centerDistance = camera.position.distanceTo(bounds.center);
  camera.near = Math.max(bounds.radius * 1e-3, centerDistance - bounds.radius * 2);
  camera.far = Math.max(camera.near + bounds.radius * 4, centerDistance + bounds.radius * 8);
  camera.updateProjectionMatrix();
}
