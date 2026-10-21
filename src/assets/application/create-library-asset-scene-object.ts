import { defaultAnimatorForImportedModel } from "../../character/application/imported-model-animator-default";
import type { LibraryAsset } from "../../lib/asset-api";
import { makeObject } from "../../lib/payload";
import type { Material, PrimitiveKind, SceneObject } from "../../types";
import { DEFAULT_OBJECT_COLOR } from "../../types";
import {
  IMAGE_ASSET_RE,
  IMPORTED_MODEL_LIBRARY_ROOT,
  materialBindingsForAsset,
  primitiveForFilename,
} from "../import-support";

type SceneInsertionAsset = Pick<LibraryAsset, "url" | "name" | "filename"> & Partial<Pick<
  LibraryAsset,
  "guid" | "kind" | "status" | "subAssets"
>>;

/** Creates the authored scene root and safe defaults for one Project asset insertion. */
export function createLibraryAssetSceneObject(
  asset: SceneInsertionAsset,
  materials: Material[],
  parentId: string | undefined,
  position?: [number, number, number],
): SceneObject {
  const lower = asset.filename.toLowerCase();
  const kind: PrimitiveKind = IMAGE_ASSET_RE.test(lower) ? "image" : primitiveForFilename(lower);
  const defaultPosition: [number, number, number] = kind === "image"
    ? [0, 1.2, 0]
    : asset.filename.startsWith(`${IMPORTED_MODEL_LIBRARY_ROOT}/`)
      ? [0, 0, 0]
      : [0, 0.8, 0];
  return makeObject(kind, Date.now() % 1000, {
    assetName: asset.name,
    assetRef: asset.guid ? { guid: asset.guid, localId: "main" } : undefined,
    assetUrl: asset.url,
    assetNote: `from library · 3d-models/${asset.filename}`,
    color: DEFAULT_OBJECT_COLOR,
    importedMaterialBindings: materialBindingsForAsset(asset.filename, materials),
    animator: defaultAnimatorForImportedModel(asset),
    meshRenderer: kind === "image" ? undefined : { castShadows: true, receiveShadows: true },
    parentId,
    position: position ?? defaultPosition,
  });
}
