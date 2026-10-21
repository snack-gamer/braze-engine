import type { ModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import type { LibraryAsset } from "../../lib/api";
import { CharacterPreviewWorkspace } from "./CharacterPreviewWorkspace";

type RigTarget = Extract<ModelSubAssetPreviewTarget, { kind: "skeleton" | "avatar" }>;

type RigPreviewProps = Readonly<{
  asset: LibraryAsset;
  target: RigTarget;
}>;

/** Shared exact-rig canvas used by both Skeleton and Avatar preview surfaces. */
export function RigPreview({ asset, target }: RigPreviewProps) {
  return (
    <CharacterPreviewWorkspace
      asset={asset}
      clips={[]}
      clipIndex={null}
      previewTarget={target}
      previewKind={target.kind}
      showAnimationControls={false}
      hidden={false}
      resizable
    />
  );
}
