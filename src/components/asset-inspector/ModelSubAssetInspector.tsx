import type { AssetSubAsset, LibraryAsset } from "../../lib/api";
import { decodeModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorRow } from "../InspectorRow";
import { modelSubAssetPresentation } from "../model-subasset-presentation";
import { PanelHeader } from "../scene/PanelHeader";
import { ModelSubAssetPreview } from "./ModelSubAssetPreview";

type Props = Readonly<{
  asset: LibraryAsset;
  subAsset: AssetSubAsset;
}>;

export function ModelSubAssetInspector({ asset, subAsset }: Props) {
  const presentation = modelSubAssetPresentation(subAsset.kind);
  const previewTarget = decodeModelSubAssetPreviewTarget(subAsset);
  return (
    <div className="rail-scroll">
      <PanelHeader
        title={subAsset.name}
        icon={<EditorIcon name={presentation.icon} size="control" />}
      />
      <div className="asset-subasset-inspector">
        <strong>{`Imported ${presentation.label.toLowerCase()}`}</strong>
        <span>{`Embedded in source ${sourceFormat(asset)} · Read-only`}</span>
        <ModelSubAssetPreview asset={asset} target={previewTarget} />
        <div className="inspector-grid">
          {Object.entries(subAsset.inspectorValues ?? {}).map(([label, value]) => (
            <InspectorRow key={label} label={label}>
              <span className="inspector-row__value">{value}</span>
            </InspectorRow>
          ))}
        </div>
      </div>
    </div>
  );
}

function sourceFormat(asset: LibraryAsset): string {
  const filename = asset.filename.trim() || asset.name.trim();
  const dot = filename.lastIndexOf(".");
  return dot >= 0 && dot < filename.length - 1
    ? filename.slice(dot + 1).toUpperCase()
    : "MODEL";
}
