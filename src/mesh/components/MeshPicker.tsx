import type { LibraryAsset } from "../../lib/asset-api";
import { AssetReferencePicker, type AssetPickerChoice } from "../../components/AssetReferencePicker";
import { SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { BUILTIN_MESHES, type MeshReference } from "../domain/mesh-reference";
import { meshBindingForReference } from "../application/mesh-assignment";

type Choice = AssetPickerChoice<MeshReference>;
export function MeshPicker({ assets, value, onChoose, onClose }: {
  assets: readonly LibraryAsset[]; value: MeshReference; onChoose: (mesh: MeshReference) => void; onClose: () => void;
}) {
  const choices: Choice[] = [{ name: "None (Mesh)", detail: "Clear geometry", value: null },
    ...BUILTIN_MESHES.map((primitive) => ({ name: primitive[0].toUpperCase() + primitive.slice(1), detail: "Built-in", source: "Built-in", assetKey: `builtin:${primitive}`, folder: "Primitives",
      value: { kind: "builtin", primitive } as MeshReference }))];
  for (const asset of assets) for (const sub of asset.subAssets ?? []) {
    if (!asset.guid || sub.kind !== "mesh") continue;
    const reference: MeshReference = { kind: "asset", asset: { guid: asset.guid, localId: sub.localId } };
    try { meshBindingForReference(reference, [asset]); choices.push({ name: sub.name, detail: asset.filename, source: "Imported", assetKey: `model:${asset.filename}`, folder: asset.filename.includes("/") ? asset.filename.slice(0, asset.filename.lastIndexOf("/")) : "Assets", value: reference }); } catch { /* Ineligible sources never masquerade as assignable meshes. */ }
  }
  return <AssetReferencePicker assetType="models" choices={choices} value={value} onChoose={onChoose} onClose={onClose}
    title="Select Mesh" searchLabel="Search meshes" closeLabel="Close mesh picker" listLabel="Meshes"
    icon={<SceneComponentIdentity componentId="meshFilter" label="" size="control" />} />;
}
