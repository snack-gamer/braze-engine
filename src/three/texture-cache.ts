import * as THREE from "three";
import {
  LeasedResourceCache,
  type ResourceCacheDiagnostics,
  type ResourceLease,
} from "./resources/leased-resource-cache";

const MAX_IDLE_TEXTURES = 32;
const MAX_IDLE_TEXTURE_BYTES = 128 * 1024 * 1024;
const textureLoader = new THREE.TextureLoader();

function estimatedTextureBytes(texture: THREE.Texture): number {
  const image = texture.image as { data?: ArrayBufferView; width?: number; height?: number } | undefined;
  if (image?.data) return image.data.byteLength;
  const width = Math.max(0, Number(image?.width) || 0);
  const height = Math.max(0, Number(image?.height) || 0);
  return Math.round(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

const textureCache = new LeasedResourceCache<THREE.Texture>({
  maxIdleEntries: MAX_IDLE_TEXTURES,
  maxIdleBytes: MAX_IDLE_TEXTURE_BYTES,
  dispose: (texture) => texture.dispose(),
});

type MaterialTextureOwnership = {
  leases: Map<string, ResourceLease<THREE.Texture>>;
  onDispose: () => void;
};

const textureReadiness = new WeakMap<THREE.Texture, Promise<void>>();

const materialOwnership = new WeakMap<THREE.Material, MaterialTextureOwnership>();

function textureKey(url: string, colorSpace: THREE.ColorSpace, flipY: boolean): string {
  return `${url}|${colorSpace}|${flipY ? "y" : "n"}`;
}

function createTexture(
  key: string,
  url: string,
  colorSpace: THREE.ColorSpace,
  flipY: boolean,
): THREE.Texture {
  let texture!: THREE.Texture;
  let ready!: () => void, failed!: (error: Error) => void;
  const pending = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  void pending.catch(() => undefined);
  texture = textureLoader.load(
    url,
    (loaded) => {
      ready();
      if (!textureCache.has(key, loaded)) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = colorSpace;
      loaded.flipY = flipY;
      loaded.needsUpdate = true;
      textureCache.updateEstimatedBytes(key, loaded, estimatedTextureBytes(loaded));
      textureCache.touch(key, loaded);
    },
    undefined,
    () => { failed(new Error(`Texture failed to load: ${url}`)); textureCache.invalidate(key, texture, "failed"); },
  );
  textureReadiness.set(texture, pending);
  texture.colorSpace = colorSpace;
  texture.flipY = flipY;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function ownershipFor(material: THREE.Material): MaterialTextureOwnership {
  const existing = materialOwnership.get(material);
  if (existing) return existing;
  const ownership: MaterialTextureOwnership = {
    leases: new Map(),
    onDispose: () => {
      ownership.leases.forEach((lease) => lease.release());
      ownership.leases.clear();
      material.removeEventListener("dispose", ownership.onDispose);
      materialOwnership.delete(material);
    },
  };
  material.addEventListener("dispose", ownership.onDispose);
  materialOwnership.set(material, ownership);
  return ownership;
}

/** Returns a shared texture whose lease follows the owning material. */
export function textureForMaterial(
  material: THREE.Material,
  url: string,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
  flipY = true,
): THREE.Texture {
  const key = textureKey(url, colorSpace, flipY);
  return retainMaterialTexture(material, key, () =>
    textureCache.acquire(key, () => createTexture(key, url, colorSpace, flipY))
  );
}

/** Binds one cache lease to Material.dispose; exposed for lifecycle tests. */
export function retainMaterialTexture(
  material: THREE.Material,
  key: string,
  acquire: () => ResourceLease<THREE.Texture>,
): THREE.Texture {
  const ownership = ownershipFor(material);
  const retained = ownership.leases.get(key);
  if (retained) return retained.value;
  const lease = acquire();
  ownership.leases.set(key, lease);
  return lease.value;
}

export function textureResourceDiagnostics(): ResourceCacheDiagnostics {
  return textureCache.diagnostics();
}

export function evictUnusedTextures(): void {
  textureCache.clearUnused();
}

/** Structural spawn preparation awaits texture leases before making a model visible. */
export async function awaitMaterialTextures(material: THREE.Material): Promise<void> {
  await Promise.all([...materialOwnership.get(material)?.leases.values() ?? []].map((lease) => textureReadiness.get(lease.value)));
}
