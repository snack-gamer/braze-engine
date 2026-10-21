import type { ModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import { PreviewUnavailable } from "../../assets/preview/PreviewUnavailable";
import type { LibraryAsset } from "../../lib/api";
import { CharacterPreviewWorkspace } from "./CharacterPreviewWorkspace";

type ClipTarget = Extract<ModelSubAssetPreviewTarget, { kind: "clip" }>;

type AnimationClipPreviewProps = Readonly<{
  asset: LibraryAsset;
  target: ClipTarget;
}>;

/** Reusable exact-clip preview with character playback and skeleton controls. */
export function AnimationClipPreview({ asset, target }: AnimationClipPreviewProps) {
  if (target.runtimeClipIndex === null) {
    return <PreviewUnavailable kind="clip" icon="animationPlayer" message="Animation clip preview unavailable" />;
  }
  return (
    <CharacterPreviewWorkspace
      asset={asset}
      clips={[{ index: target.runtimeClipIndex, name: target.name }]}
      previewTarget={{ localId: target.localId, requiredClipIndex: target.runtimeClipIndex }}
      previewKind="clip"
      hidden={false}
      resizable
    />
  );
}
