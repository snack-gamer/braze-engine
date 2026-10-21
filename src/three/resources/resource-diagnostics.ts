import { environmentTextureDiagnostics } from "../../lib/env-texture";
import { assetResourceDiagnostics } from "../assets";
import { textureResourceDiagnostics } from "../texture-cache";

/** Snapshot of CPU/GPU-backed resources retained by the shared editor pools. */
export function sharedResourceDiagnostics() {
  return {
    importedAssets: assetResourceDiagnostics(),
    materialTextures: textureResourceDiagnostics(),
    environmentTextures: environmentTextureDiagnostics(),
  };
}

export type SharedResourceDiagnostics = ReturnType<typeof sharedResourceDiagnostics>;
