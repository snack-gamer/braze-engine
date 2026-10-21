import type { DisplacerModifier } from "../domain/authored-modifier";

export type DisplacerTextureAsset = {
  url: string;
  filename: string;
  name?: string;
};

export function displacerTexturePatch(
  asset: DisplacerTextureAsset | null,
): Partial<DisplacerModifier> {
  return {
    textureUrl: asset?.url,
    textureName: asset ? asset.name || asset.filename : undefined,
    textureFilename: asset?.filename,
    textureFlipY: asset ? true : undefined,
  };
}

export function parseDisplacerTextureDrop(raw: string): DisplacerTextureAsset | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const payload = value as Record<string, unknown>;
    if (payload.kind !== "image" || typeof payload.url !== "string" || !payload.url) return null;
    if (typeof payload.filename !== "string" || !payload.filename) return null;
    return {
      url: payload.url,
      filename: payload.filename,
      name: typeof payload.name === "string" && payload.name ? payload.name : payload.filename,
    };
  } catch {
    return null;
  }
}

export function patchDisplacerUvAxis(
  values: readonly [number, number],
  axis: 0 | 1,
  value: number,
): [number, number] {
  const next: [number, number] = [...values];
  next[axis] = value;
  return next;
}
