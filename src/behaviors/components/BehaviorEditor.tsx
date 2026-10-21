import { useState } from "react";
import { SceneComponentSection } from "../../components/scene/SceneComponentPresentation";
import { EditorIcon } from "../../ui/EditorIcon";
import type { SceneObject } from "../../scene/domain/scene-object";
import { addBehaviorEntry, removeBehaviorComponent, removeBehaviorEntry, resetBehaviorEntryValues, setBehaviorEntryEnabled, setBehaviorFieldValue } from "../application/behavior-authoring";
import type { BehaviorCatalogSnapshot } from "../application/behavior-catalog";
import { ENTITY_BEHAVIOR_LIMITS } from "../domain/entity-behaviors";
import { BehaviorEntryEditor } from "./BehaviorEntryEditor";
import "./behavior-editor.css";

export type BehaviorEditorProps = Readonly<{
  object: SceneObject;
  objects: readonly SceneObject[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
}>;

/** Authoring values remain in the scene/prefab and enter the existing undo/dirty operation. */
export function BehaviorEditor({ object, objects, updateObject, catalog, reload }: BehaviorEditorProps & Readonly<{
  catalog: BehaviorCatalogSnapshot;
  reload: () => void;
}>) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string>();
  const component = object.behaviors;
  if (!component) return null;
  const definition = catalog.definitions.find((entry) => entry.id === selected) ?? catalog.definitions[0];
  const commit = (operation: () => Partial<SceneObject>) => {
    try { updateObject(object.id, operation()); setError(undefined); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  const full = component.entries.length >= ENTITY_BEHAVIOR_LIMITS.perEntity;
  const canAdd = !component.unavailable && catalog.status === "ready" && definition && !full;
  return <SceneComponentSection componentId="behaviors" id="object.behaviors" defaultOpen
    onRemove={() => commit(removeBehaviorComponent)}
    actions={<button type="button" className="icon-button danger" title="Remove Behaviors" aria-label="Remove Behaviors"
      onClick={() => commit(removeBehaviorComponent)}><EditorIcon name="delete" size="control" /></button>}>
    <p className="behavior-editor__note">Saved settings are captured when Play starts or a prefab instance is created.</p>
    {component.unavailable && <p className="behavior-editor__issue" role="status">{component.unavailable.message} Original settings are retained; restore a supported component before editing.</p>}
    {catalog.status === "loading" && <p role="status">Loading behavior definitions…</p>}
    {catalog.status === "failed" && <p className="behavior-editor__issue" role="alert">Could not load behavior definitions: {catalog.message}. Saved settings are retained.</p>}
    {catalog.status === "ready" && !catalog.definitions.length && <p className="behavior-editor__note">This project has no registered behaviors. Add definitions to its game module to make them available here.</p>}
    <div className="behavior-editor__catalog">
      <select aria-label="Behavior definition" value={definition?.id ?? ""} disabled={!canAdd} onChange={(event) => setSelected(event.currentTarget.value)}>
        {!definition && <option value="">No definitions available</option>}
        {catalog.definitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <button type="button" className="ghost-button compact" disabled={!canAdd} title={full ? `Maximum ${ENTITY_BEHAVIOR_LIMITS.perEntity} behaviors per object` : "Attach the selected behavior with its defaults"}
        onClick={() => definition && commit(() => addBehaviorEntry(object, definition))}>Add behavior</button>
      <button type="button" className="icon-button" title="Reload behavior definitions" aria-label="Reload behavior definitions"
        disabled={catalog.status === "loading"} onClick={reload}><EditorIcon name="refresh" size="control" /></button>
    </div>
    {full && <p className="behavior-editor__note">Maximum {ENTITY_BEHAVIOR_LIMITS.perEntity} behaviors per object reached.</p>}
    {error && <p className="behavior-editor__issue" role="alert">{error}</p>}
    {!component.unavailable && component.entries.map((entry) => {
      const registered = catalog.definitions.find((item) => item.id === entry.type);
      return <BehaviorEntryEditor key={entry.id} entry={entry} registration={registered} catalogReady={catalog.status === "ready"} objects={objects}
        onEnable={(enabled) => commit(() => setBehaviorEntryEnabled(object, entry.id, enabled))}
        onRemove={() => commit(() => removeBehaviorEntry(object, entry.id))}
        onReset={() => registered && commit(() => resetBehaviorEntryValues(object, entry.id, registered))}
        onField={(key, value) => registered && commit(() => setBehaviorFieldValue(object, entry.id, registered, key, value))} />;
    })}
  </SceneComponentSection>;
}
