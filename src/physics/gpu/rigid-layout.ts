/** Matching WGSL layouts live in shaders/rigid-common.ts. All fields are vec4 aligned. */
export const RIGID_LAYOUT = Object.freeze({
  smallWorldThreshold: 64,
  workgroupSize: 64,
  poseBytes: 16,
  propertyBytes: 112,
  forceOffsetBytes: 80,
  velocityBytes: 32,
  uniformBytes: 48,
  contactBytes: 64,
  contactsPerPair: 8,
  manifoldBytes: 32 + 8 * 64,
  substeps: 4,
  solveSweeps: 4,
  relaxationSweeps: 2,
});
