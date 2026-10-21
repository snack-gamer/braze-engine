import { useMemo } from "react";
import type {
  ModelAnimationClipSource,
  ResolvedModelAnimationClipSettings,
} from "../../character/application/model-animation-clip-settings";
import { CharacterPreviewWorkspace } from "../../character/components/CharacterPreviewWorkspace";
import type { LibraryAsset } from "../../lib/asset-api";
import { modelAnimationSourcePreviewUrl } from "../../lib/model-import-settings";

type Props = Readonly<{
  asset: LibraryAsset;
  clip: ModelAnimationClipSource;
  settings: ResolvedModelAnimationClipSettings;
}>;

export type ModelImportAnimationPreviewSelection = Readonly<{
  clip: ModelAnimationClipSource;
  settings: ResolvedModelAnimationClipSettings;
}>;

/** Plays unapplied clip import settings against the immutable source take. */
export function ModelImportAnimationPreview({ asset, clip, settings }: Props) {
  const previewAsset = useMemo(() => ({
    ...asset,
    url: modelAnimationSourcePreviewUrl(asset.url),
  }), [asset]);
  const draftClip = useMemo(() => ({
    sourceIndex: clip.sourceIndex,
    ...(settings.firstFrame !== null && settings.lastFrame !== null ? {
      firstFrame: settings.firstFrame,
      lastFrame: settings.lastFrame,
    } : {}),
    looping: settings.looping,
    loopPose: settings.loopPose,
  }), [
    clip.sourceIndex,
    settings.firstFrame,
    settings.lastFrame,
    settings.looping,
    settings.loopPose,
  ]);

  return (
    <CharacterPreviewWorkspace
      asset={previewAsset}
      ariaLabel="Animation clip preview"
      clips={[{ index: clip.sourceIndex, name: settings.name }]}
      clipIndex={clip.sourceIndex}
      previewTarget={{
        localId: clip.localId,
        requiredClipIndex: clip.sourceIndex,
        draftClip,
      }}
      previewKind="clip"
      hidden={false}
      resizable
    />
  );
}
