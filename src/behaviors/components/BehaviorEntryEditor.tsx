import { SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { InspectorToggle } from "../../components/InspectorToggle";
import { InspectorRow } from "../../components/InspectorRow";
import { EditorIcon } from "../../ui/EditorIcon";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorEntry, BehaviorValue } from "../domain/behavior-component";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { behaviorEntryIssue } from "../application/behavior-authoring";
import { BehaviorFieldControl } from "./BehaviorFieldControl";

export function BehaviorEntryEditor({ entry, registration, catalogReady, objects, onEnable, onRemove, onReset, onField }: Readonly<{
  entry: BehaviorEntry;
  registration?: BehaviorRegistration;
  catalogReady: boolean;
  objects: readonly SceneObject[];
  onEnable: (enabled: boolean) => void;
  onRemove: () => void;
  onReset: () => void;
  onField: (key: string, value: BehaviorValue) => void;
}>) {
  const label = registration?.label ?? entry.type;
  const issue = catalogReady ? behaviorEntryIssue(entry, registration) : undefined;
  const editable = Boolean(catalogReady && registration && registration.version === entry.typeVersion);
  const unknown = registration ? Object.keys(entry.values).filter((key) => !registration.fields.some((field) => field.key === key)) : [];
  return <article className="component-card behavior-entry" aria-label={`Behavior ${label}`}>
    <div className="component-card__head">
      <span><SceneComponentIdentity componentId="behaviors" label={label} /></span>
      <div className="behavior-entry__actions">
        {editable && <button type="button" className="icon-button" title={`Reset behavior ${label} settings`} aria-label={`Reset behavior ${label} settings`} onClick={onReset}>
          <EditorIcon name="reset" size="control" />
        </button>}
        <button type="button" className="icon-button danger" title={`Remove behavior ${label}`} aria-label={`Remove behavior ${label}`} onClick={onRemove}>
          <EditorIcon name="delete" size="control" />
        </button>
      </div>
    </div>
    <InspectorRow label="Enabled"><InspectorToggle checked={entry.enabled} ariaLabel={`Enable behavior ${label}`} onChange={onEnable} /></InspectorRow>
    {registration?.description && <p className="behavior-editor__note">{registration.description}</p>}
    {issue && <p className="behavior-editor__issue" role="status">{issue}{editable && " Correct the saved fields or reset settings to their defaults."}</p>}
    {editable && registration?.fields.map((field) => <BehaviorFieldControl key={field.key} field={field}
      value={Object.prototype.hasOwnProperty.call(entry.values, field.key) ? entry.values[field.key] : field.default}
      label={`${label}: ${field.label}`} objects={objects} onChange={(value) => onField(field.key, value)} />)}
    {!editable && Object.keys(entry.values).length > 0 && <details className="behavior-editor__stored">
      <summary>Saved settings (read only)</summary>
      <dl>{Object.entries(entry.values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{JSON.stringify(value)}</dd></div>)}</dl>
    </details>}
    {unknown.length > 0 && editable && <p className="behavior-editor__note">Retained settings outside this definition: {unknown.join(", ")}.</p>}
  </article>;
}
