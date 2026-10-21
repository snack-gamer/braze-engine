import type { PrimitiveKind } from "../types";

export function round(value: number) {
  return Number(value.toFixed(4));
}

export function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Friendly display name for an asset reference. Strips any directory path and
// file extension so the inspector shows "FreeHoraSeSněhem", never the raw
// "imported-library/.../FreeHoraSeSněhem.fbx" wiring. Users see names, not paths.
export function assetDisplayName(pathOrName: string | undefined): string {
  if (!pathOrName) return "";
  const base = pathOrName.split(/[\\/]/).pop() ?? pathOrName;
  return base.replace(/\.[^./\\]+$/, "").trim() || base;
}

export function primitiveLabel(kind: PrimitiveKind) {
  if (kind === "transform") return "Transform";
  if (kind === "fbx") return "FBX";
  if (kind === "usdz") return "USDZ";
  if (kind === "usd") return "USD";
  if (kind === "gltf") return "GLB";
  if (kind === "water") return "Water";
  if (kind === "cloner") return "Cloner";
  if (kind === "effector") return "Effector";
  if (kind === "particle") return "Particles";
  if (kind === "directionalLight") return "Directional Light";
  return kind;
}
