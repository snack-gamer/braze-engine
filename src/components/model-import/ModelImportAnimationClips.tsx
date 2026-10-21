import type {
  ModelAnimationClipSource,
  ResolvedModelAnimationClipSettings,
} from "../../character/application/model-animation-clip-settings";
import { EditorControlGroup, EditorNumberField, EditorPropertyRow } from "../../ui";
import { ModelImportToggleRow } from "./ModelImportControlRows";
import { ModelImportClipRange } from "./ModelImportClipRange";

export type ModelImportAnimationClipRow = Readonly<{
  source: ModelAnimationClipSource;
  settings: ResolvedModelAnimationClipSettings;
}>;

type Props = Readonly<{
  rows: readonly ModelImportAnimationClipRow[];
  selectedLocalId: string;
  canAdd: boolean;
  onSelect: (localId: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  onChange: (changes: Readonly<{
    name?: string;
    looping?: boolean;
    loopPose?: boolean;
    firstFrame?: number;
    lastFrame?: number;
  }>) => void;
}>;

function frameLabel(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Unity-style imported Clip list plus selected source-range authoring controls. */
export function ModelImportAnimationClips({
  rows,
  selectedLocalId,
  canAdd,
  onSelect,
  onAdd,
  onRemove,
  onChange,
}: Props) {
  const selectedRow = rows.find((row) => row.source.localId === selectedLocalId) ?? rows[0] ?? null;
  const selected = selectedRow?.source ?? null;
  const settings = selectedRow?.settings ?? null;
  const hasTiming = selected !== null
    && settings !== null
    && selected.frameRate !== null
    && selected.sourceFirstFrame !== null
    && selected.sourceLastFrame !== null
    && settings.firstFrame !== null
    && settings.lastFrame !== null;
  const sourceSpan = hasTiming ? selected.sourceLastFrame! - selected.sourceFirstFrame! : 1;
  const duration = hasTiming ? (settings.lastFrame! - settings.firstFrame!) / selected.frameRate! : null;

  return (
    <EditorControlGroup
      id="asset.importSettings.animation.clip"
      title="Clips"
      meta={`${rows.length} clip${rows.length === 1 ? "" : "s"}`}
      note="Clip identity stays stable across rename and reimport. Start and End are inclusive source frames."
    >
      <div className="model-import-clip-table" role="listbox" aria-label="Imported animation clips">
        <div className="model-import-clip-table__header" aria-hidden="true">
          <span>Clips</span><span>Start</span><span>End</span>
        </div>
        <div className="model-import-clip-table__body">
          {rows.map((row) => (
            <button
              key={row.source.localId}
              type="button"
              role="option"
              aria-selected={row.source.localId === selectedRow?.source.localId}
              className={row.source.localId === selectedRow?.source.localId ? "is-selected" : ""}
              onClick={() => onSelect(row.source.localId)}
            >
              <span>{row.settings.name}</span>
              <span>{frameLabel(row.settings.firstFrame)}</span>
              <span>{frameLabel(row.settings.lastFrame)}</span>
            </button>
          ))}
          {rows.length === 0 && <p>No imported clips. Add one from the source take.</p>}
        </div>
        <div className="model-import-clip-table__actions">
          <button type="button" aria-label="Add animation clip" title="Add clip" disabled={!canAdd} onClick={onAdd}>+</button>
          <button type="button" aria-label="Remove selected animation clip" title="Remove clip" disabled={!selectedRow} onClick={onRemove}>−</button>
        </div>
      </div>

      {selected && settings && (
        <>
          <EditorPropertyRow label="Source Take">
            <span className="model-import-animation-tab__source">{selected.sourceName}</span>
          </EditorPropertyRow>
          <EditorPropertyRow label="Name">
            <input
              className="editor-input"
              aria-label="Animation clip name"
              maxLength={120}
              value={settings.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </EditorPropertyRow>

          {hasTiming && (
            <>
              <div className="model-import-animation-tab__timing-summary">
                <span>Length {duration!.toFixed(3)} s</span>
                <span>{frameLabel(selected.frameRate!)} FPS</span>
              </div>
              <ModelImportClipRange
                minimum={selected.sourceFirstFrame!}
                maximum={selected.sourceLastFrame!}
                firstFrame={settings.firstFrame!}
                lastFrame={settings.lastFrame!}
                onChange={onChange}
              />
              <div className="model-import-animation-tab__frame-fields">
                <EditorPropertyRow label="Start">
                  <EditorNumberField
                    value={settings.firstFrame!}
                    min={selected.sourceFirstFrame!}
                    max={settings.lastFrame! - Math.min(1, sourceSpan)}
                    step={1}
                    decimals={0}
                    ariaLabel="Animation clip start frame"
                    onChange={(firstFrame) => onChange({ firstFrame })}
                  />
                </EditorPropertyRow>
                <EditorPropertyRow label="End">
                  <EditorNumberField
                    value={settings.lastFrame!}
                    min={settings.firstFrame! + Math.min(1, sourceSpan)}
                    max={selected.sourceLastFrame!}
                    step={1}
                    decimals={0}
                    ariaLabel="Animation clip end frame"
                    onChange={(lastFrame) => onChange({ lastFrame })}
                  />
                </EditorPropertyRow>
              </div>
            </>
          )}

          {!hasTiming && (
            <p className="inspector-note">This source format does not expose an editable frame range yet.</p>
          )}
          <ModelImportToggleRow
            label="Loop Time"
            checked={settings.looping}
            onChange={(looping) => onChange({ looping })}
          />
          <ModelImportToggleRow
            label="Loop Pose"
            checked={settings.loopPose}
            onChange={(loopPose) => onChange({ loopPose })}
          />
        </>
      )}
    </EditorControlGroup>
  );
}
