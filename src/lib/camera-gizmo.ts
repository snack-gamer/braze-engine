import { createRenderCamera, applyRenderCameraLens, type RenderCamera } from "../camera/adapters/render-camera";
import type { CameraSettings } from "../scene/domain/camera";
import { readEditorColorToken } from "../ui/theme-tokens";
import * as THREE from "three";
import type { Vec3 } from "../types";

// CameraHelper draws the full frustum out to `far`. With far at 200 units the
// wireframe extends way past the viewport — barely visible against the scene.
// Clamp the gizmo's visual depth so it stays a useful editor indicator. The
// real camera's far is unchanged; this only affects the wireframe rendering.
const GIZMO_VISUAL_FAR = 2.5;
const GIZMO_VISUAL_NEAR = 0.15;

type CameraGizmoUpdate = Pick<CameraSettings, "projection" | "fovAxis" | "orthographicSize"> & {
  position: Vec3;
  target: Vec3;
  fov: number;
  near: number;
  far: number;
  aspect: number;
};

export type CameraGizmo = {
  helper: THREE.CameraHelper;
  source: RenderCamera;
  update: (next: CameraGizmoUpdate) => void;
  refreshAspect: (aspect: number) => void;
  refreshPose: (position: Vec3, target: Vec3) => void;
  setActive: (active: boolean) => void;
  setVisible: (visible: boolean) => void;
  updateView: (viewer: THREE.Camera, ancestorsVisible?: boolean) => boolean;
  dispose: () => void;
};

// THREE.CameraHelper renders the frustum of a source PerspectiveCamera as
// LineSegments at its world transform. We keep a hidden source camera per
// SceneObject and re-derive its matrix whenever the SceneObject changes.
export function createCameraGizmo(): CameraGizmo {
  const ACTIVE_COLOR = new THREE.Color(readEditorColorToken("--scene-camera-selected", "#afb4ba")).getHex();
  const INACTIVE_COLOR = new THREE.Color(readEditorColorToken("--scene-camera-inactive", "#72777d")).getHex();
  let source = createRenderCamera();
  let projection: CameraSettings["projection"] = "perspective";
  const helper = new THREE.CameraHelper(source);
  // The helper is editor chrome; never let it intercept selection clicks.
  helper.raycast = () => {};
  helper.traverse((child) => {
    child.raycast = () => {};
  });
  // Strip visual chrome we don't want in the frustum:
  //   • u1/u2/u3 — the "up" indicator triangle above the near plane.
  //   • cn1..cn4, cf1..cf4 — the "+" cross marks on the near and far planes
  //     (reads as a grid in front of the camera).
  // The camera glyph identifies the origin. Delete
  // these pointMap entries so subsequent update() calls skip them, then collapse
  // the existing vertex positions to origin so the segments render at zero
  // length.
  const pointMap = helper.pointMap as Record<string, number[] | undefined>;
  const stripIndices: number[] = [];
  const stripKeys = ["u1", "u2", "u3", "cn1", "cn2", "cn3", "cn4", "cf1", "cf2", "cf3", "cf4"] as const;
  for (const key of stripKeys) {
    const entries = pointMap[key];
    if (entries) stripIndices.push(...entries);
    delete pointMap[key];
  }
  const positionAttr = helper.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (const idx of stripIndices) positionAttr.setXYZ(idx, 0, 0, 0);
  positionAttr.needsUpdate = true;
  // Switch to a single material color — CameraHelper ships with vertexColors
  // enabled and per-segment tinting (frustum orange, cone red, target white,
  // etc.). We want a uniform tone, so disable vertexColors and let
  // material.color drive every line.
  const material = helper.material as THREE.LineBasicMaterial;
  material.vertexColors = false;
  material.needsUpdate = true;
  applyColor(helper, INACTIVE_COLOR);

  const lookTarget = new THREE.Vector3();
  let last: CameraGizmoUpdate | null = null;
  let authoredVisible = true;
  let viewVisible = true;

  const apply = (next: CameraGizmoUpdate) => {
    if (projection !== (next.projection ?? "perspective")) {
      projection = next.projection ?? "perspective";
      source = createRenderCamera(projection); helper.camera = source; helper.matrix = source.matrixWorld;
    }
    source.position.set(next.position[0], next.position[1], next.position[2]);
    lookTarget.set(next.target[0], next.target[1], next.target[2]);
    source.lookAt(lookTarget);

    // The gizmo source is decoupled from the live camera — we want a visually
    // sensible frustum, not a literal one. Real near/far still apply at render
    // time via ThreeScene's main camera.
    source.near = Math.max(GIZMO_VISUAL_NEAR, Math.min(next.near, GIZMO_VISUAL_FAR * 0.5));
    source.far = Math.min(next.far, GIZMO_VISUAL_FAR);
    source.aspect = next.aspect;
    applyRenderCameraLens(source, { ...next, near: source.near, far: source.far });
    source.updateMatrixWorld(true);
    helper.update();
  };

  return {
    helper,
    get source() { return source; },
    update(next) {
      last = next;
      apply(next);
    },
    refreshAspect(aspect) {
      if (!last || last.aspect === aspect) return;
      last = { ...last, aspect };
      apply(last);
    },
    refreshPose(position, target) {
      if (!last) return;
      last = { ...last, position, target };
      apply(last);
    },
    setActive(active) {
      applyColor(helper, active ? ACTIVE_COLOR : INACTIVE_COLOR);
    },
    setVisible(visible) {
      authoredVisible = visible;
      helper.visible = authoredVisible && viewVisible;
    },
    updateView(viewer, ancestorsVisible = true) {
      // Look through and close fly-throughs never render their own gizmos.
      // Distance also handles reload without relying on a sticky UI flag.
      viewVisible = ancestorsVisible && source.position.distanceToSquared(viewer.position) > 0.05 ** 2;
      helper.visible = authoredVisible && viewVisible;
      return viewVisible;
    },
    dispose() {
      helper.dispose();
    },
  };
}

function applyColor(helper: THREE.CameraHelper, hex: number) {
  const material = helper.material as THREE.LineBasicMaterial;
  material.color.setHex(hex);
}
