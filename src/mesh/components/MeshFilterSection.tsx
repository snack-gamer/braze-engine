import { useState } from "react";
import type { SceneObject } from "../../types";
import { InspectorObjectField } from "../../components/InspectorObjectField";
import { InspectorRow } from "../../components/InspectorRow";
import { SceneComponentSection, SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";
import { requestProjectModelSubAssetFocus } from "../../assets/application/project-asset-focus-channel";
import { runtimeUrlForLibraryAsset } from "../../assets/application/scene-asset-resolution";
import { removeComponentPatch } from "../../lib/components";
import { primitiveLabel, assetDisplayName } from "../../lib/format";
import { assignMeshPatch, meshAssignmentUnavailableReason } from "../application/mesh-assignment";
import { meshReferenceForObject, type MeshReference } from "../domain/mesh-reference";
import { MESH_DRAG_TYPE, readMeshDrag } from "./mesh-drag";
import "./mesh-filter.css";

import { MeshPicker } from "./MeshPicker";

export function MeshFilterSection({ object, updateObject }: { object: SceneObject; updateObject: (id: string, patch: Partial<SceneObject>) => void }) {
  const assets = useImportedAssetCatalog(), [open, setOpen] = useState(false), [error, setError] = useState("");
  const reference = meshReferenceForObject(object), unavailable = meshAssignmentUnavailableReason(object);
  const asset = reference?.kind === "asset" ? assets.find((item) => item.guid === reference.asset.guid) : undefined;
  const meshName = object.meshFilter?.empty ? undefined : object.assetMissing ? "Missing (Mesh)"
    : object.assetMeshBinding?.name ?? (object.assetName ? assetDisplayName(object.assetName) : primitiveLabel(object.primitive));
  const choose = (mesh: MeshReference) => {
    try {
      const patch = assignMeshPatch(object, mesh, assets);
      const source = mesh?.kind === "asset" ? assets.find((item) => item.guid === mesh.asset.guid) : undefined;
      if (source) patch.assetUrl = runtimeUrlForLibraryAsset(source);
      updateObject(object.id, patch); setError(""); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <SceneComponentSection componentId="meshFilter" id="object.meshFilter" className="mesh-filter-section" defaultOpen
    onReset={!unavailable ? () => choose(null) : undefined}
    onRemove={() => updateObject(object.id, removeComponentPatch(object, "meshFilter"))}>
    <div onDragOver={(event) => { if (!unavailable && event.dataTransfer.types.includes(MESH_DRAG_TYPE)) {
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy";
    } }} onDrop={(event) => {
      if (!event.dataTransfer.types.includes(MESH_DRAG_TYPE)) return;
      event.preventDefault(); event.stopPropagation(); if (unavailable) return;
      const mesh = readMeshDrag(event.dataTransfer); if (mesh !== undefined) choose(mesh);
    }}>
      <InspectorRow label="Mesh" className="inspector-row--wide-control">
        <InspectorObjectField name={meshName} placeholder="None (Mesh)" icon={<SceneComponentIdentity componentId="meshFilter" label="" size="control" />}
          title={unavailable ?? (object.assetMissing ? `Missing mesh: ${object.assetRef?.localId}. Restore its source or choose another mesh.` : meshName)}
          disabled={Boolean(unavailable)} pickLabel="Select Mesh" onPick={() => setOpen(true)} onClear={() => choose(null)}
          onReveal={asset ? () => requestProjectModelSubAssetFocus({ filename: asset.filename, localId: object.assetRef?.localId ?? "main" }) : undefined} />
      </InspectorRow>
    </div>
    {(error || unavailable || object.assetMissing) && <p className="mesh-filter-feedback" role={error || object.assetMissing ? "alert" : undefined}>
      {error || unavailable || "The referenced mesh is missing. Restore its source or select another mesh."}
    </p>}
    {open && <MeshPicker assets={assets} value={reference} onChoose={choose} onClose={() => setOpen(false)} />}
  </SceneComponentSection>;
}
