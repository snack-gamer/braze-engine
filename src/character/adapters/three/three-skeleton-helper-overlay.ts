import * as THREE from "three";

export type ThreeSkeletonHelperOverlay = Readonly<{
  object: THREE.SkeletonHelper;
  dispose: () => void;
}>;

/** Creates editor-only skeleton chrome. The caller owns frame requests. */
export function createThreeSkeletonHelperOverlay(
  root: THREE.Object3D,
  bones?: readonly THREE.Bone[],
  color = new THREE.Color(0x66b8ff),
): ThreeSkeletonHelperOverlay {
  const helper = new THREE.SkeletonHelper(root);
  if (bones) {
    const included = new Set<THREE.Bone>(bones);
    helper.bones = helper.bones.filter((bone) => (
      included.has(bone)
      && (!(bone.parent as THREE.Bone | null)?.isBone || included.has(bone.parent as THREE.Bone))
    ));
    helper.geometry.setDrawRange(0, helper.bones.filter((bone) => (
      (bone.parent as THREE.Bone | null)?.isBone
    )).length * 2);
  }
  helper.name = "Braze Skeleton Preview";
  helper.raycast = () => {};
  const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
  for (const material of materials) {
    if ("color" in material && material.color instanceof THREE.Color) material.color.copy(color);
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;
    material.opacity = 0.9;
  }
  let disposed = false;
  return {
    object: helper,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      helper.removeFromParent();
      helper.dispose();
    },
  };
}
