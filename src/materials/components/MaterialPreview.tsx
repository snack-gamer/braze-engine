import type { ModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import { createImportedSubAssetPreview } from "../../assets/preview/InteractiveModelPreview";
import { createThreeMaterialSubAssetPreviewController } from "../../assets/preview/three/imported-subasset-preview-controller";

type MaterialTarget = Extract<ModelSubAssetPreviewTarget, { kind: "material" }>;

/** Reusable physically rendered imported-material sphere preview. */
export const MaterialPreview = createImportedSubAssetPreview<MaterialTarget>(
  "material",
  "material",
  createThreeMaterialSubAssetPreviewController,
);
