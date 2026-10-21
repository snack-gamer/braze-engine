import * as THREE from "three";
import type { Runtime } from "../runtime";

/** Explicit authoring snapshot; never samples simulated poses or animated skin deformation. */
export function captureCollisionMesh(runtime: Runtime, objectId: string) {
  const root = runtime.objectMap.get(objectId);
  if (!root) throw new Error("Object geometry is not loaded in a viewport.");
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), roots = new Set(runtime.objectMap.values());
  const vertices: number[] = [], indices: number[] = [];
  const visit = (node: THREE.Object3D) => {
    if (node.userData.editorChrome === true || node !== root && roots.has(node as THREE.Group)) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) throw new Error("Bake a static mesh; skinned and instanced geometry need an explicit collision asset.");
      const position = mesh.geometry.getAttribute("position");
      if (position) {
        const matrix = inverse.clone().multiply(mesh.matrixWorld), base = vertices.length / 3;
        for (let i = 0; i < position.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
          vertices.push(point.x, point.y, point.z);
        }
        const index = mesh.geometry.getIndex(), count = index?.count ?? position.count;
        const start = mesh.geometry.drawRange.start, end = Math.min(count, start + mesh.geometry.drawRange.count);
        for (let i = start; i + 2 < end; i += 3) for (let j = 0; j < 3; j++) indices.push(base + (index ? index.getX(i + j) : i + j));
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  if (!indices.length) throw new Error("Object has no loaded triangle geometry to bake.");
  return { vertices, indices };
}
