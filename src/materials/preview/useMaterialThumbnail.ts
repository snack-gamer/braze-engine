import type { Material } from "../domain/material";
import { useGeneratedAssetPreviewState } from "../../assets/preview/useAssetPreview";
import { materialThumbnailRevision } from "./material-thumbnail-revision";

/** Requests a cached, physically shaded material sphere from the shared preview renderer. */
export function useMaterialThumbnail(material: Material, enabled: boolean) {
  return useGeneratedAssetPreviewState({
    kind: "material",
    url: material.id,
    revision: materialThumbnailRevision(material),
    size: "thumbnail",
    material,
  }, enabled);
}
