import type { AssetPreviewSize } from "./asset-preview-source";

export type AssetPreviewDimensions = Readonly<{ width: number; height: number }>;

const DIMENSIONS: Record<AssetPreviewSize, AssetPreviewDimensions> = Object.freeze({
  thumbnail: Object.freeze({ width: 192, height: 192 }),
  inspector: Object.freeze({ width: 512, height: 352 }),
});

export function assetPreviewDimensions(size: AssetPreviewSize): AssetPreviewDimensions {
  return DIMENSIONS[size];
}
