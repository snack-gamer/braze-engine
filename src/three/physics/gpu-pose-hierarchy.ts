import * as THREE from "three";

/** Cold snapshots precede any GPU binding, including separately simulated descendants. */
export function captureGpuPoseHierarchy(node: THREE.Object3D, bodyRoots: ReadonlySet<THREE.Object3D> = new Set()) {
  node.updateWorldMatrix(true, true);
  const rootWorld = node.matrixWorld.clone();
  const inverse = rootWorld.clone().invert();
  const meshes = new Map<THREE.Mesh, THREE.Matrix4>();
  const visit = (child: THREE.Object3D) => {
    if (child !== node && bodyRoots.has(child)) return;
    if ((child as THREE.Mesh).isMesh) meshes.set(child as THREE.Mesh, inverse.clone().multiply(child.matrixWorld));
    for (const next of child.children) visit(next);
  };
  visit(node);
  return { rootWorld, meshes };
}

/** Model matrices stay identity because pose materials produce world-space positions. */
export function pinGpuPoseTransforms(nodes: Iterable<THREE.Object3D>) {
  const originals = [...new Set(nodes)].map((node) => ({ node, matrix: node.matrix.clone(), world: node.matrixWorld.clone(),
    auto: node.matrixAutoUpdate, worldAuto: node.matrixWorldAutoUpdate, culled: node.frustumCulled }));
  for (const { node } of originals) {
    node.matrixAutoUpdate = false; node.matrixWorldAutoUpdate = false;
    node.matrix.identity(); node.matrixWorld.identity(); node.frustumCulled = false;
  }
  return () => {
    for (const { node, matrix, world, auto, worldAuto, culled } of originals) {
      node.matrix.copy(matrix); node.matrixWorld.copy(world);
      node.matrixAutoUpdate = auto; node.matrixWorldAutoUpdate = worldAuto; node.frustumCulled = culled;
    }
  };
}
