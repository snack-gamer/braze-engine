import { useState } from "react";
import { ConfirmModal } from "../../components/AssetBrowser/ConfirmModal";
import { useProjectInput } from "../application/useProjectInput";
import type { LibraryAsset } from "../../lib/asset-api";
import { PanelHeader } from "../../components/scene/PanelHeader";
import { EditorIcon } from "../../ui/EditorIcon";
import { useInputActionMapDraft } from "../application/useInputActionMapDraft";
import { inputActionMapPresentation } from "../presentation/input-action-map-presentation";
import { InputActionMapEditor } from "./InputActionMapEditor";
import { ProjectInputSelection } from "./ProjectInputSelection";
import "./input-action-map-inspector.css";
import { createStockControlInputMap } from "../domain/stock-control-input-map";

export default function InputActionMapInspector({ asset, assets, onSaved, onReveal, onDelete }: {
  asset: LibraryAsset;
  assets: readonly LibraryAsset[];
  onSaved: () => void;
  onReveal: () => void;
  onDelete: () => void;
}) {
  const draft = useInputActionMapDraft(asset, onSaved);
  const project = useProjectInput();
  const [deleting, setDeleting] = useState(false);
  const projectUse = asset.guid && project.settings.actionMap?.guid.toLowerCase() === asset.guid.toLowerCase();
  return <div className="rail-scroll input-map">
    <PanelHeader title={inputActionMapPresentation.label} icon={<EditorIcon name={inputActionMapPresentation.icon} size="control" />}
      actions={<>
        <button type="button" className="icon-button" title="Reveal in Finder" aria-label="Reveal input map" onClick={onReveal}><EditorIcon name="openExternal" size="control" /></button>
        <button type="button" className="icon-button danger" title="Delete asset" aria-label="Delete input map" disabled={!project.ready || project.saving} onClick={() => setDeleting(true)}><EditorIcon name="delete" size="control" /></button>
      </>} />
    <div className="input-map__content">
      <p className="input-map__hint">{asset.filename}</p>
      {draft.loading && <p role="status">Loading input map…</p>}
      {draft.draft && <>
        <label className="input-map__name">Asset name<input aria-label="Asset name" maxLength={120} value={draft.draft.name}
          disabled={draft.loading} onChange={(event) => draft.edit((current) => ({ ...current, name: event.target.value }))} /></label>
        <InputActionMapEditor map={draft.draft.map} disabled={draft.loading}
          onChange={(map) => draft.edit((current) => ({ ...current, map }))} />
        <button type="button" className="ghost-button" disabled={draft.loading || draft.saving}
          onClick={() => draft.edit((current) => ({ ...current, map: createStockControlInputMap() }))}>Use character controls preset</button>
      </>}
      {draft.validation && <p role="alert">{draft.validation}</p>}
      {draft.error && <p role="alert">{draft.conflict ? "This map changed on disk. Your edits remain unsaved. Revert to load the current revision. " : ""}{draft.error}</p>}
      <div className="input-map__buttons">
        <button type="button" className="ghost-button" disabled={!draft.dirty || draft.loading || draft.saving || !!draft.validation || draft.conflict}
          onClick={() => void draft.save()}>Save input map</button>
        <button type="button" className="ghost-button" disabled={draft.loading || draft.saving || (!draft.dirty && !draft.error)}
          onClick={() => void draft.revert()}>Revert input map</button>
      </div>
      <p className="input-map__hint" role="status">{draft.saving ? "Saving input map…" : draft.dirty ? "Unsaved input map changes" : draft.draft ? "Input map saved" : ""}</p>
      <ProjectInputSelection asset={asset} assets={assets} project={project} />
    </div>
    {deleting && <ConfirmModal title="Delete Input Action Map"
      message={`Delete "${asset.name}"?${projectUse ? "\n\nProject input uses this map. Its saved GUID remains; Play will report Missing Input Action Map until you restore it or clear the selection." : ""}${draft.dirty ? "\n\nUnsaved draft changes will be discarded." : ""}`}
      onConfirm={() => { setDeleting(false); onDelete(); }} onCancel={() => setDeleting(false)} />}
  </div>;
}
