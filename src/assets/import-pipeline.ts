import { uploadAsset, uploadAssetToFolder, type LibraryAsset } from "../lib/api";
import {
  analyzeModelImport,
  basename,
  dirname,
  findSelectedImportFile,
  joinImportPath,
  normalizeImportPath,
  relativeUploadPaths,
  type ModelImportReference,
  type RelativeUploadEntry,
} from "../lib/model-import";
import type { Material } from "../types";
import {
  extractImportedMaterialDescriptors,
  loadAndPrepareAsset,
  type LoadedAsset,
} from "../three/assets";
import { disposeImportedAssetSource } from "../three/resources/imported-asset-lifetime";
import {
  MODEL_ASSET_RE,
  bundleRelativeFilename,
  missingTexturePlaceholderBlob,
  primitiveForFilename,
  resolveImportedTextureAsset,
  safeImportName,
  shouldExposeImportedAsset,
  textureFieldPatch,
} from "./import-support";

type ImportAssetFilesPorts = {
  refreshAssets: () => Promise<unknown>;
  createMaterials: (patches: Array<Partial<Material> & { name: string }>) => void;
};

/** Imports a selected file set and localizes a model's dependent resources. */
export async function importAssetFiles(
  files: FileList | File[] | null,
  destination: string,
  ports: ImportAssetFilesPorts,
): Promise<LibraryAsset[]> {
  if (!files) return [];
  const targetFolder = normalizeImportPath(destination);
  const fileItems = Array.from(files);
  const modelFiles = fileItems.filter((file) => MODEL_ASSET_RE.test(file.name));
  if (modelFiles.length !== 1) {
    const uploaded = await Promise.all(
      fileItems.map(async (file) => {
        try {
          return await uploadAsset(file, targetFolder);
        } catch (error) {
          console.error("asset upload failed", error);
          return null;
        }
      }),
    );
    await ports.refreshAssets();
    return uploaded.filter((asset): asset is LibraryAsset => asset !== null);
  }

  const modelFile = modelFiles[0]!;
  const folder = targetFolder;
  const entries = relativeUploadPaths(fileItems);
  const modelEntry = entries.find((entry) => entry.file === modelFile);
  const modelDirectory = dirname(modelEntry?.path || modelFile.name);
  const analysis = await analyzeModelImport(modelFile).catch((error): null => {
    console.warn("model import analysis failed", modelFile.name, error);
    return null;
  });
  const externalReferences = (analysis?.references ?? []).filter((reference) => reference.source === "external");
  const embeddedTextures = (analysis?.references ?? []).filter(
    (reference) => reference.kind === "texture" && reference.source === "embedded",
  );
  const uploadedByRelative = new Map<string, LibraryAsset>();
  const uploadedByBundlePath = new Map<string, LibraryAsset>();
  const missingExternalTexturePaths = new Set<string>();
  const uploadedAssets: LibraryAsset[] = [];
  const exposedAssetKeys = new Set<string>();
  let modelAsset: LibraryAsset | null = null;

  const rememberUploadedAsset = (asset: LibraryAsset) => {
    const normalizedFilename = normalizeImportPath(asset.filename);
    uploadedByRelative.set(normalizedFilename, asset);
    uploadedByBundlePath.set(bundleRelativeFilename(normalizedFilename, folder).toLowerCase(), asset);
    if (!shouldExposeImportedAsset(asset) || exposedAssetKeys.has(asset.filename)) return;
    exposedAssetKeys.add(asset.filename);
    uploadedAssets.push(asset);
  };

  const uploadBundleEntry = async (entry: RelativeUploadEntry, targetPath = entry.path) => {
    const normalizedTargetPath = normalizeImportPath(targetPath) || entry.file.name;
    const asset = await uploadAssetToFolder(entry.file, folder, normalizedTargetPath, basename(normalizedTargetPath));
    rememberUploadedAsset(asset);
    return asset;
  };

  for (const entry of entries) {
    try {
      const asset = await uploadBundleEntry(entry);
      if (entry.file === modelFile) modelAsset = asset;
    } catch (error) {
      console.error("asset bundle upload failed", error);
    }
  }

  const missingExternalReferences: ModelImportReference[] = [];
  for (const reference of externalReferences) {
    const targetPath = normalizeImportPath(reference.path);
    const loaderTargetPath = joinImportPath(modelDirectory, targetPath);
    if (!loaderTargetPath || uploadedByBundlePath.has(loaderTargetPath.toLowerCase())) continue;
    const selected = findSelectedImportFile(reference, entries);
    if (!selected) {
      missingExternalReferences.push(reference);
      continue;
    }
    try {
      await uploadBundleEntry(selected, loaderTargetPath);
    } catch (error) {
      console.error("asset sidecar localization failed", loaderTargetPath, error);
    }
  }

  for (const reference of missingExternalReferences) {
    if (reference.kind !== "texture") continue;
    const loaderTargetPath = joinImportPath(modelDirectory, normalizeImportPath(reference.path));
    if (!loaderTargetPath) continue;
    missingExternalTexturePaths.add(loaderTargetPath.toLowerCase());
    const placeholder = await missingTexturePlaceholderBlob(loaderTargetPath);
    if (!placeholder) continue;
    try {
      await uploadAssetToFolder(placeholder, folder, loaderTargetPath, basename(loaderTargetPath));
    } catch (error) {
      console.warn("missing texture placeholder upload failed", loaderTargetPath, error);
    }
  }

  if (embeddedTextures.length > 0) {
    console.info(
      `model import detected ${embeddedTextures.length} embedded texture${embeddedTextures.length === 1 ? "" : "s"}; extracting editable copies`,
    );
  }
  if (missingExternalReferences.length > 0) {
    console.warn(
      "model import missing external resources; import the model folder or select these files with the model",
      missingExternalReferences.map((reference) => `${reference.kind}:${reference.path}`),
    );
  }

  if (modelAsset) {
    let loaded: LoadedAsset | null = null;
    try {
      loaded = await loadAndPrepareAsset(modelAsset.url, primitiveForFilename(modelAsset.filename));
      const descriptors = extractImportedMaterialDescriptors(loaded.object);
      const embeddedTextureUploads = new Map<string, Promise<LibraryAsset | null>>();
      const materialPatches: Array<Partial<Material> & { name: string }> = [];
      for (const descriptor of descriptors) {
        const patch: Partial<Material> & { name: string } = {
          name: `${safeImportName(modelAsset.name)} / ${descriptor.name}`,
          color: descriptor.color,
          roughness: descriptor.roughness,
          metalness: descriptor.metalness,
          specularIntensity: descriptor.specularIntensity,
          clearcoat: descriptor.clearcoat,
          clearcoatRoughness: descriptor.clearcoatRoughness,
          ior: descriptor.ior,
          transmission: descriptor.transmission,
          emissive: descriptor.emissive,
          emissiveIntensity: descriptor.emissiveIntensity,
          opacity: descriptor.opacity,
          normalScale: descriptor.normalScale,
          aoIntensity: descriptor.aoIntensity,
          alphaCutoff: descriptor.alphaCutoff,
          envMapIntensity: descriptor.envMapIntensity,
          thickness: descriptor.thickness,
          sheen: descriptor.sheen,
          sheenRoughness: descriptor.sheenRoughness,
          sheenColor: descriptor.sheenColor,
          side: descriptor.side,
          wireframe: descriptor.wireframe,
          sourceAssetFilename: modelAsset.filename,
          sourceMaterialSlotKey: descriptor.slotKey,
          sourceMaterialName: descriptor.name,
        };
        for (const texture of descriptor.textures) {
          const textureAsset = await resolveImportedTextureAsset(
            texture,
            folder,
            descriptor,
            uploadedByRelative,
            uploadedByBundlePath,
            missingExternalTexturePaths,
            embeddedTextureUploads,
          );
          if (!textureAsset) continue;
          if (!uploadedByRelative.has(normalizeImportPath(textureAsset.filename)) && textureAsset.sizeBytes > 0) {
            rememberUploadedAsset(textureAsset);
          }
          Object.assign(patch, textureFieldPatch(texture.kind, textureAsset, texture.flipY));
        }
        materialPatches.push(patch);
      }
      if (materialPatches.length > 0) ports.createMaterials(materialPatches);
    } catch (error) {
      console.error("material extraction failed", error);
    } finally {
      if (loaded) disposeImportedAssetSource(loaded);
    }
  }

  await ports.refreshAssets();
  return uploadedAssets;
}
