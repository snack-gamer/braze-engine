// Shared per-frame resources consumed by every ocean water material.
//
// The water mesh's onBeforeRender reads these refs each frame to keep its
// uniforms in sync with scene lighting/environment state.
//
// Module-level values are limited to scalar/vector lighting inputs shared by
// the two synchronized viewports. Texture ownership stays viewport-local.

import * as THREE from "three";

type WaterShared = {
  // Unit vector pointing TOWARD the sun in world space. Sourced from the
  // scene's key directional light each frame so reflections and specular agree
  // with the rest of the scene.
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  environmentIntensity: number;
  environmentRotation: number;
  environmentColor: THREE.Color;
};

export const waterShared: WaterShared = {
  sunDirection: new THREE.Vector3(0.43, 0.76, 0.54),
  sunIntensity: 1.2,
  environmentIntensity: 1,
  environmentRotation: 0,
  environmentColor: new THREE.Color("#0b0d0f"),
};
