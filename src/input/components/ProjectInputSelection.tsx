import type { LibraryAsset } from "../../lib/asset-api";
import { useProjectInput } from "../application/useProjectInput";
import { selectableProjectInputAssets, selectedProjectInputAsset } from "../application/project-input-asset-selection";

export function ProjectInputSelection({ asset, assets, project }: { asset?: LibraryAsset; assets: readonly LibraryAsset[]; project: ReturnType<typeof useProjectInput> }) {
  const selected = project.settings.actionMap?.guid ?? "";
  const selection = selectedProjectInputAsset(selected, assets);
  const options = selectableProjectInputAssets(assets);
  const available = asset && options.some((candidate) => candidate.guid?.toLowerCase() === asset.guid?.toLowerCase());
  return <section className="input-map__project" aria-label="Project input settings">
    <h3>Project input</h3>
    <label>Input map<select className="editor-select" aria-label="Project input map" value={selected}
      disabled={!project.ready || project.saving}
      onChange={(event) => void project.select(event.target.value ? { guid: event.target.value, localId: "main" } : undefined)}>
      <option value="">Module fallback</option>
      {selected && selection.problem && <option value={selected}>{selection.problem} ({selected})</option>}
      {options.map((candidate) => <option key={candidate.guid} value={candidate.guid!.toLowerCase()}>{candidate.name}</option>)}
    </select></label>
    <div className="input-map__buttons">
      {asset && <button type="button" className="ghost-button" disabled={!project.ready || project.saving || !available || selected.toLowerCase() === asset.guid?.toLowerCase()}
        onClick={() => void project.select({ guid: asset.guid!, localId: "main" })}>Use for project</button>}
      <button type="button" className="ghost-button" disabled={!project.ready || project.saving || !selected}
        onClick={() => void project.select()}>Clear project input map</button>
    </div>
    <p className="input-map__hint" role="status">{project.saving ? "Saving project input…" : !project.ready ? "Loading project input…"
      : selected ? `Project input: ${selection.problem || selection.asset?.name}` : "Project input: module fallback"}</p>
    {selected && selection.problem && <p role="alert">{selection.problem === "Missing Input Action Map"
      ? "The selected Input Action Map is missing." : `${selection.problem}.`} Restore a valid source with its GUID or clear the selection.</p>}
    {project.error && <div role="alert">{project.error}<button type="button" className="ghost-button" onClick={() => void project.reload()}>Reload project input</button></div>}
    <p className="input-map__hint">The saved map is captured when Play starts. Changes apply to the next run.</p>
  </section>;
}
