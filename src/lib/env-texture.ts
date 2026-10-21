import * as THREE from "three";
import {
  LeasedResourceCache,
  type ResourceCacheDiagnostics,
  type ResourceLease,
} from "../three/resources/leased-resource-cache";

const MAX_IDLE_ENV_TEXTURES = 1;
const MAX_IDLE_ENV_BYTES = 192 * 1024 * 1024;
const envTextureCache = new LeasedResourceCache<Promise<THREE.DataTexture>>({
  maxIdleEntries: MAX_IDLE_ENV_TEXTURES,
  maxIdleBytes: MAX_IDLE_ENV_BYTES,
  dispose: (promise) => void promise.then((texture) => texture.dispose(), () => undefined),
});

function estimatedBytes(texture: THREE.DataTexture): number {
  const data = texture.image?.data as ArrayBufferView | undefined;
  return data?.byteLength ?? 0;
}

// Pick the right loader by file extension. .hdr → Radiance RGBE,
// .exr → OpenEXR half-float. Both come back as equirect DataTextures
// ready to assign to scene.environment.
export function acquireEnvTexture(url: string): ResourceLease<Promise<THREE.DataTexture>> {
  let created!: Promise<THREE.DataTexture>;
  return envTextureCache.acquire(url, () => {
    const isExr = /\.exr(\?|$)/i.test(url);
    created = (isExr
      ? import("three/examples/jsm/loaders/EXRLoader.js").then(({ EXRLoader }) => new EXRLoader())
      : import("three/examples/jsm/loaders/RGBELoader.js").then(({ RGBELoader }) => new RGBELoader())
    ).then((loader) => new Promise<THREE.DataTexture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            resolve(texture);
          },
          undefined,
          (error) => reject(error instanceof Error ? error : new Error(String(error))),
        );
      }));
    void created.then(
      (texture) => envTextureCache.updateEstimatedBytes(url, created, estimatedBytes(texture)),
      () => envTextureCache.invalidate(url, created, "failed"),
    );
    return created;
  });
}

export function environmentTextureDiagnostics(): ResourceCacheDiagnostics {
  return envTextureCache.diagnostics();
}
