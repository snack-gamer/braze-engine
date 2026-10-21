import * as THREE from "three";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

type TransformControlsInternals = TransformControls & {
  _gizmo: {
    gizmo: Record<string, THREE.Object3D>;
    picker: Record<string, THREE.Object3D>;
    helper: Record<string, THREE.Object3D>;
  };
};

// Stock Three gizmos draw mirrored negative arms with invisible pick zones.
// Dense editor viewports use positive arms only and compact their geometry.
const GIZMO_HANDLE_COMPACT = 0.85;

export function customizeTransformGizmo(transformControls: TransformControls): void {
  const internals = transformControls as TransformControlsInternals;
  for (const mode of ["translate", "scale"] as const) {
    for (const group of [internals._gizmo.gizmo[mode], internals._gizmo.picker[mode]]) {
      for (const child of [...group.children]) {
        const mesh = child as THREE.Mesh;
        if (!mesh.geometry) continue;
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (!bounds) continue;
        const negativeOnly =
          (child.name === "X" && bounds.max.x < 0) ||
          (child.name === "Y" && bounds.max.y < 0) ||
          (child.name === "Z" && bounds.max.z < 0);
        if (negativeOnly) group.remove(child);
      }
    }
  }

  for (const bucket of [internals._gizmo.gizmo, internals._gizmo.picker]) {
    for (const group of Object.values(bucket)) {
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.scale(GIZMO_HANDLE_COMPACT, GIZMO_HANDLE_COMPACT, GIZMO_HANDLE_COMPACT);
      }
    }
  }

  for (const helperGroup of Object.values(internals._gizmo.helper)) {
    for (const child of [...helperGroup.children]) {
      if ((child as THREE.Line).isLine) helperGroup.remove(child);
    }
  }
}
