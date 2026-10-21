import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createAssetCache,
  createAssetResourcePool,
  type LoadedAsset,
} from "./assets";
import { disposeObject } from "./dispose";
import { cloneImportedAsset } from "./resources/imported-asset-lifetime";

function sourceAsset(): LoadedAsset {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.userData.originalMaterial = material;
  const object = new THREE.Group();
  object.add(mesh);
  return { object, animations: [] };
}

describe("shared imported asset lifetime", () => {
  it("shares one source across viewports and disposes it only after both clones release", async () => {
    const source = sourceAsset();
    const sourceMesh = source.object.children[0] as THREE.Mesh;
    const sourceMaterial = sourceMesh.material as THREE.MeshStandardMaterial;
    const sourceTexture = sourceMaterial.map!;
    const geometryDispose = vi.spyOn(sourceMesh.geometry, "dispose");
    const materialDispose = vi.spyOn(sourceMaterial, "dispose");
    const textureDispose = vi.spyOn(sourceTexture, "dispose");
    const load = vi.fn(async () => source);
    const pool = createAssetResourcePool(load);
    const sceneAssets = createAssetCache(pool);
    const gameAssets = createAssetCache(pool);

    const sceneLease = sceneAssets.acquire("/shared.glb", "gltf");
    const gameLease = gameAssets.acquire("/shared.glb", "gltf");
    const loaded = await sceneLease.value;
    expect(await gameLease.value).toBe(loaded);
    expect(load).toHaveBeenCalledOnce();

    const sceneClone = cloneImportedAsset(sceneLease, loaded);
    const gameClone = cloneImportedAsset(gameLease, loaded);
    const sceneMesh = sceneClone.children[0] as THREE.Mesh;
    const gameMesh = gameClone.children[0] as THREE.Mesh;
    expect(sceneMesh.geometry).toBe(sourceMesh.geometry);
    expect(gameMesh.geometry).toBe(sourceMesh.geometry);
    expect(sceneMesh.material).not.toBe(sourceMaterial);
    expect(gameMesh.material).not.toBe(sourceMaterial);

    disposeObject(sceneClone);
    pool.cache.clearUnused();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    disposeObject(gameClone);
    expect(pool.cache.diagnostics().references).toBe(0);
    pool.cache.clearUnused();
    await Promise.resolve();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(pool.cache.diagnostics().references).toBe(0);
  });

  it("evicts failed loads so a later acquisition retries", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce(sourceAsset());
    const pool = createAssetResourcePool(load);
    const assets = createAssetCache(pool);

    const failed = assets.acquire("/retry.glb", "gltf");
    await expect(failed.value).rejects.toThrow("network failed");
    failed.release();
    const retry = assets.acquire("/retry.glb", "gltf");
    await expect(retry.value).resolves.toBeDefined();

    expect(load).toHaveBeenCalledTimes(2);
    expect(pool.cache.diagnostics().failedLoads).toBe(1);
    retry.release();
    pool.cache.clearUnused();
  });
});
