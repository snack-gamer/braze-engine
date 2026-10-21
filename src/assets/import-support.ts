import { uploadAssetToFolder, type LibraryAsset } from "../lib/api";
import { basename, normalizeImportPath } from "../lib/model-import";
import { PREFAB_ASSET_RE } from "../lib/prefabs";
import type { Material, PrimitiveKind, SceneObject } from "../types";
import type { ImportedMaterialDescriptor, ImportedTextureDescriptor } from "../three/assets";

export const FONT_ASSET_RE = /\.(woff2?|ttf|otf)$/i;
export const IMAGE_ASSET_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
export const MODEL_ASSET_RE = /\.(fbx|usdz|usd|glb|gltf)$/i;
export const IMPORTED_MODEL_LIBRARY_ROOT = "imported-library";

export function isModelAsset(asset: Pick<LibraryAsset, "kind" | "filename">): boolean {
  return asset.kind === "model" || (!asset.kind && MODEL_ASSET_RE.test(asset.filename));
}

export function isImageAsset(asset: Pick<LibraryAsset, "kind" | "filename">): boolean {
  return asset.kind === "image" || (!asset.kind && IMAGE_ASSET_RE.test(asset.filename));
}

export function isPrefabAsset(asset: Pick<LibraryAsset, "filename" | "kind">): boolean {
  return asset.kind === "prefab" || (!asset.kind && PREFAB_ASSET_RE.test(asset.filename));
}

export function safeImportName(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "model"
  );
}

export function primitiveForFilename(filename: string): PrimitiveKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".fbx")) return "fbx";
  if (lower.endsWith(".usdz")) return "usdz";
  if (lower.endsWith(".usd")) return "usd";
  return "gltf";
}

export function materialBindingsForAsset(filename: string, materials: Material[]) {
  return materials
    .filter((material) => material.sourceAssetFilename === filename && material.sourceMaterialSlotKey)
    .map((material) => ({
      slotKey: material.sourceMaterialSlotKey!,
      materialId: material.id,
      sourceName: material.sourceMaterialName,
    }));
}

export function repairImportedMaterialBindings(object: SceneObject, materials: Material[]): SceneObject {
  if (object.importedMaterialBindings !== undefined) return object;
  const filename = assetFilenameFromUrl(object.assetUrl);
  if (!filename || !MODEL_ASSET_RE.test(filename)) return object;
  const bindings = materialBindingsForAsset(filename, materials);
  return bindings.length > 0 ? { ...object, importedMaterialBindings: bindings } : object;
}

export function assetRelativeFilename(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.href);
    const prefix = "/3d-models/";
    if (!parsed.pathname.startsWith(prefix)) return undefined;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export function assetFilenameFromUrl(url: string | undefined): string | undefined {
  const relative = assetRelativeFilename(url);
  return relative ? normalizeImportPath(relative) : undefined;
}

export function assetFilenameMatchesDeleted(filename: string | undefined, deleted: string): boolean {
  if (!filename) return false;
  const normalizedFilename = normalizeImportPath(filename);
  const normalizedDeleted = normalizeImportPath(deleted);
  return normalizedFilename === normalizedDeleted || normalizedFilename.startsWith(`${normalizedDeleted}/`);
}

export function assetUrlForRelative(filename: string): string {
  return `/3d-models/${normalizeImportPath(filename)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function bundleRelativeFilename(filename: string, folder: string): string {
  const normalized = normalizeImportPath(filename);
  const prefix = `${folder}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

export function shouldExposeImportedAsset(asset: LibraryAsset): boolean {
  return MODEL_ASSET_RE.test(asset.filename) || IMAGE_ASSET_RE.test(asset.filename) || FONT_ASSET_RE.test(asset.filename) || isPrefabAsset(asset);
}

async function assetUrlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export function textureFieldPatch(
  kind: ImportedTextureDescriptor["kind"],
  asset: LibraryAsset,
  flipY: boolean,
): Partial<Material> {
  const name = asset.name || asset.filename.split("/").pop() || asset.filename;
  const field = kind === "baseColor" ? "baseColor" : kind;
  return {
    [`${field}TextureUrl`]: asset.url,
    [`${field}TextureName`]: name,
    [`${field}TextureFilename`]: asset.filename,
    [`${field}TextureFlipY`]: flipY,
  } as Partial<Material>;
}

async function textureToPngBlob(texture: ImportedTextureDescriptor["texture"]): Promise<Blob | null> {
  const image = texture.image as CanvasImageSource & { width?: number; height?: number } | undefined;
  const width = Number(image?.width ?? 0);
  const height = Number(image?.height ?? 0);
  if (!image || width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, width, height);
  } catch {
    return null;
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function missingTexturePlaceholderBlob(filename: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1, 1);
  const mime = /\.jpe?g$/i.test(filename) ? "image/jpeg" : "image/png";
  return new Promise((resolve) => canvas.toBlob(resolve, mime));
}

export async function resolveImportedTextureAsset(
  texture: ImportedTextureDescriptor,
  folder: string,
  descriptor: ImportedMaterialDescriptor,
  uploadedByRelative: Map<string, LibraryAsset>,
  uploadedByBundlePath: Map<string, LibraryAsset>,
  missingExternalTexturePaths: Set<string>,
  embeddedTextureUploads: Map<string, Promise<LibraryAsset | null>>,
): Promise<LibraryAsset | null> {
  const relativeFilename = assetRelativeFilename(texture.url);
  if (relativeFilename) {
    const normalizedFilename = normalizeImportPath(relativeFilename);
    const bundlePath = bundleRelativeFilename(normalizedFilename, folder).toLowerCase();
    if (missingExternalTexturePaths.has(bundlePath)) return null;
    const asset = uploadedByRelative.get(normalizedFilename) ?? uploadedByBundlePath.get(bundlePath);
    if (asset) return asset;
    const url = assetUrlForRelative(normalizedFilename);
    if (await assetUrlExists(url)) {
      return {
        filename: normalizedFilename,
        name: basename(normalizedFilename) || normalizedFilename,
        kind: "image",
        path: `3d-models/${normalizedFilename}`,
        url,
        sizeBytes: 0,
      };
    }
    console.warn("model import skipped missing external texture", descriptor.name, texture.name, normalizedFilename);
    return null;
  }

  const uploadKey = texture.texture.uuid || `${descriptor.slotKey}:${texture.kind}`;
  let upload = embeddedTextureUploads.get(uploadKey);
  if (!upload) {
    upload = (async () => {
      const blob = await textureToPngBlob(texture.texture);
      if (!blob) return null;
      const fileStem = safeImportName(`${descriptor.name}-${texture.kind}-${texture.name}`);
      return uploadAssetToFolder(blob, folder, `textures/${fileStem}.png`, `${fileStem}.png`);
    })();
    embeddedTextureUploads.set(uploadKey, upload);
  }
  return upload;
}
