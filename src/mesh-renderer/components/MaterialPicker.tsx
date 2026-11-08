import { useEffect, useState } from "react";
import { fetchProjectSectionSnapshot } from "../../lib/project-api";
import { useMaterialThumbnail } from "../../materials/preview/useMaterialThumbnail";
import type { Material } from "../../types";
import { AssetReferencePicker } from "../../components/AssetReferencePicker";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetDisplayName } from "../../lib/format";
export function MaterialPicker({ materials, value, onChoose, onClose }: {
  materials: Material[]; value: string | null; onChoose: (value: string | null) => void; onClose: () => void;
}) {
  const [folders, setFolders] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void fetchProjectSectionSnapshot().then(({ project }) => { if (active) setFolders(project.assets?.itemFolders ?? {}); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <AssetReferencePicker<string | null> assetType="materials" title="Select Material" searchLabel="Search materials" listLabel="Materials" closeLabel="Close material picker"
    choices={[{ name: "None (Material)", detail: "Use the mesh's default surface", value: null },
      ...materials.map((material) => ({ name: assetDisplayName(material.name), detail: material.name, value: material.id, assetKey: `material:${material.id}`, source: material.sourceAssetFilename ? "Imported" : "Project", folder: folders[`material:${material.id}`] || "Assets" }))]}
    preview={(item, enabled) => {
      const material = materials.find((entry) => entry.id === item.value);
      return material ? <MaterialPickerPreview material={material} enabled={enabled} /> : <EditorIcon name="material" size="control" />;
    }} value={value} onChoose={onChoose} onClose={onClose} icon={<EditorIcon name="material" size="control" />} />;
}

function MaterialPickerPreview({ material, enabled }: { material: Material; enabled: boolean }) {
  const preview = useMaterialThumbnail(material, enabled);
  return <span className="asset-picker__material" data-material-preview-status={preview.status} style={{ backgroundColor: preview.url && enabled ? "transparent" : material.color }}>
    {preview.url && enabled && <img src={preview.url} alt="" draggable={false} />}
  </span>;
}
