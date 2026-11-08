import type { SceneObject } from "../../types";
import { createAssetCache } from "../../three/assets";
import type { RendererMaterialSlot } from "../application/renderer-material-slots";
/** Cold metadata query leases the existing shared source pool and releases on all paths. */
export async function sourceMaterialSlots(object: SceneObject): Promise<RendererMaterialSlot[]> {
  if (!object.assetUrl || object.assetMeshBinding || object.assetMissing || !["gltf", "fbx", "usd", "usdz"].includes(object.primitive)) return [];
  const cache = createAssetCache();
  try {
    const source = await cache.acquire(object.assetUrl, object.primitive).value;
    const slots = new Map<string, RendererMaterialSlot>();
    source.object.traverse((node) => {
      const mesh = node as import("three").Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const keys = mesh.userData.tganMaterialSlotKeys as string[] | undefined;
      materials.forEach((material, index) => {
        const key = keys?.[index];
        if (key && !slots.has(key)) slots.set(key, { key, sourceName: material.name || "Material" });
      });
    });
    return [...slots.values()];
  } catch { return []; } finally { cache.dispose(); }
}
