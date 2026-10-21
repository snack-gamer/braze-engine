import { useAssetPreview } from "../../assets/preview/useAssetPreview";
import type { AssetSubAsset, LibraryAsset } from "../../lib/api";
import { EditorIcon } from "../../ui/EditorIcon";
import type { CSSProperties } from "react";
import { IconAssetTile } from "./IconAssetTile";
import { modelSubAssetPresentation } from "../model-subasset-presentation";
import { writeAnimationClipDrag } from "../../character/components/animation-clip-drag-data";

type Props = Readonly<{
  asset: LibraryAsset;
  subAsset: AssetSubAsset;
  selected: boolean;
  focused: boolean;
  showPreview: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}>;

export function ModelSubAssetTile({
  asset,
  subAsset,
  selected,
  focused,
  showPreview,
  onClick,
  onDoubleClick,
}: Props) {
  const presentation = modelSubAssetPresentation(subAsset.kind);
  const disabled = subAsset.kind === "clip" && subAsset.importEnabled === false;
  const draggableClip = subAsset.kind === "clip"
    && !disabled
    && typeof asset.guid === "string"
    && /^[a-f0-9]{32}$/i.test(asset.guid)
    && Boolean(subAsset.localId.trim());
  const detail = disabled ? `${presentation.label} · Not imported` : presentation.label;
  const previewColor = subAsset.kind === "material"
    && typeof subAsset.previewColor === "string"
    && /^#[\da-f]{6}$/i.test(subAsset.previewColor)
    ? subAsset.previewColor
    : null;
  const preview = useAssetPreview(
    "model",
    asset.url,
    showPreview && subAsset.kind === "mesh",
    asset.contentRevision ?? asset.updatedAt,
  );
  const visual = previewColor ? (
    <span
      className="model-subasset-tile__material-preview"
      style={{ "--model-subasset-color": previewColor } as CSSProperties}
    />
  ) : preview ? (
    <>
      <img src={preview} alt="" className="asset-tile__preview" draggable={false} />
      <span className="model-subasset-tile__badge"><EditorIcon name={presentation.icon} size="compact" /></span>
    </>
  ) : undefined;
  return (
    <IconAssetTile
      className={`model-subasset-tile model-subasset-tile--${subAsset.kind}${disabled ? " disabled" : ""}`}
      icon={presentation.icon}
      visual={visual}
      iconClassName={`model-subasset-tile__icon${visual ? " model-subasset-tile__icon--preview" : ""}`}
      name={subAsset.name}
      meta={detail}
      selected={selected}
      focused={focused}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${subAsset.name} · ${detail} in ${asset.name}${draggableClip ? " · Double-click to edit events · Drag into Behavior Map" : ""}`}
      dataKind={subAsset.kind}
      dataGuid={asset.guid}
      dataLocalId={subAsset.localId}
      onDragStart={draggableClip ? (event) => writeAnimationClipDrag(event.dataTransfer, {
        clipRef: { guid: asset.guid!, localId: subAsset.localId },
        name: subAsset.name.trim() || presentation.label,
      }) : undefined}
    />
  );
}
