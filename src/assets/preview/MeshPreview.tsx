import type { ModelSubAssetPreviewTarget } from "../domain/model-subasset-preview-target";
import { createImportedSubAssetPreview } from "./InteractiveModelPreview";
import { createThreeMeshSubAssetPreviewController } from "./three/imported-subasset-preview-controller";

type MeshTarget = Extract<ModelSubAssetPreviewTarget, { kind: "mesh" }>;

/** Reusable isolated imported-mesh preview backed by the shared model preview session. */
export const MeshPreview = createImportedSubAssetPreview<MeshTarget>(
  "mesh",
  "assetModel",
  createThreeMeshSubAssetPreviewController,
);
