import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type OrbitMotionInternals = OrbitControls & {
  _sphericalDelta?: THREE.Spherical;
  _panOffset?: THREE.Vector3;
  _scale?: number;
};

/** Clear pending OrbitControls motion before an explicit camera animation. */
export function clearOrbitMotion(controls: OrbitControls): void {
  const internals = controls as OrbitMotionInternals;
  internals._sphericalDelta?.set(0, 0, 0);
  internals._panOffset?.set(0, 0, 0);
  if (typeof internals._scale === "number") internals._scale = 1;
}
