import type { ComponentType } from "react";
import type { ModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import { InteractiveModelPreview } from "../../assets/preview/InteractiveModelPreview";
import { MeshPreview } from "../../assets/preview/MeshPreview";
import { PreviewUnavailable } from "../../assets/preview/PreviewUnavailable";
import { AnimationClipPreview } from "../../character/components/AnimationClipPreview";
import { RigPreview } from "../../character/components/RigPreview";
import type { LibraryAsset } from "../../lib/api";
import { MaterialPreview } from "../../materials/components/MaterialPreview";

type PreviewTargetKind = ModelSubAssetPreviewTarget["kind"];
type PreviewTarget<Kind extends PreviewTargetKind> = Extract<ModelSubAssetPreviewTarget, { kind: Kind }>;
type PreviewProps<Kind extends PreviewTargetKind> = Readonly<{
  asset: LibraryAsset;
  target: PreviewTarget<Kind>;
}>;
type PreviewRegistry = {
  readonly [Kind in PreviewTargetKind]: ComponentType<PreviewProps<Kind>>;
};

const PREVIEW_BY_KIND = {
  mesh: MeshPreview,
  material: MaterialPreview,
  clip: AnimationClipPreview,
  skeleton: RigPreview,
  avatar: RigPreview,
  model: ({ asset, target }) => (
    <InteractiveModelPreview
      asset={asset}
      previewKind="model"
      previewLabel={target.name}
      previewIcon="assetModel"
    />
  ),
  unknown: ({ target }) => (
    <PreviewUnavailable
      kind={target.sourceKind}
      icon="object"
      message="No preview is registered for this imported item"
    />
  ),
} satisfies PreviewRegistry;

/** Dispatches validated importer metadata through one exhaustive preview registry. */
export function ModelSubAssetPreview({
  asset,
  target,
}: Readonly<{ asset: LibraryAsset; target: ModelSubAssetPreviewTarget }>) {
  // The closed mapped registry guarantees the renderer and discriminated target
  // share a kind; TypeScript cannot preserve that correlation through lookup.
  const Preview = PREVIEW_BY_KIND[target.kind] as ComponentType<Readonly<{
    asset: LibraryAsset;
    target: ModelSubAssetPreviewTarget;
  }>>;
  return <Preview asset={asset} target={target} />;
}
