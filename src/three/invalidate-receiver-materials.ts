import type { Material, Mesh, Object3D } from "three";

/** Refresh r184 receiver shaders when a shadow/pose material graph changes lifetime. */
export function invalidateReceiverMaterials(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((node) => {
    const material = (node as Mesh).material;
    if (material) for (const item of Array.isArray(material) ? material : [material]) materials.add(item);
  });
  for (const material of materials) material.needsUpdate = true;
}
