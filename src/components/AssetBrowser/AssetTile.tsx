import type { Material } from "../../types";
import { useMaterialThumbnail } from "../../materials/preview/useMaterialThumbnail";

type AssetTileProps = {
  material: Material;
  displayName: string;
  showPreview: boolean;
  selected: boolean;
  focused: boolean;
  assigned: boolean;
  activeObjectName?: string;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
};

// Pure visual material tile — no inline action buttons. All actions live in
// the right-click context menu owned by AssetBrowser. Drag payload still
// flows from this tile so users can drag a material onto a hierarchy row.
export function AssetTile({
  material,
  displayName,
  showPreview,
  selected,
  focused,
  assigned,
  activeObjectName,
  onClick,
  onDoubleClick,
}: AssetTileProps) {
  const preview = useMaterialThumbnail(material, showPreview);
  return (
    <div
      className={[
        "asset-tile",
        selected ? "selected" : "",
        focused ? "focused" : "",
        assigned ? "assigned" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-tgan-material", material.id);
        event.dataTransfer.effectAllowed = "link";
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={
        activeObjectName
          ? `Double-click to assign to "${activeObjectName}" · drag to hierarchy · right-click for actions`
          : "Drag onto a hierarchy row · right-click for actions"
      }
    >
      <span
        className={`asset-tile__swatch${preview.url ? " asset-tile__swatch--rendered" : ""}`}
        data-material-preview-status={preview.status}
        style={{
          backgroundColor: material.color,
          boxShadow: previewShadow(material),
        }}
      >
        {preview.url && <img src={preview.url} alt="" className="asset-tile__preview" draggable={false} />}
      </span>
      <span className="asset-tile__name">{displayName}</span>
    </div>
  );
}

// Exported so AssetBrowser can render the same swatch inside an EditTile
// while a material is being renamed.
export function materialSwatch(material: Material) {
  return (
    <span
      className="asset-tile__swatch"
      style={{
        backgroundColor: material.color,
        boxShadow: previewShadow(material),
      }}
    />
  );
}

function previewShadow(material: Material): string {
  if (material.emissiveIntensity <= 0) return "none";
  const strength = Math.min(1, material.emissiveIntensity / 2);
  return `0 0 ${(8 + strength * 12).toFixed(0)}px ${material.emissive}`;
}
