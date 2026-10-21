import { InspectorNumberInput } from "../components/InspectorNumberInput";
import { EditorCheckbox } from "../ui/controls";
import { EditorIcon } from "../ui/EditorIcon";
import {
  SECTION_KIND_LABELS,
  type SelectedSequencerItem,
} from "./sequencer-presentation";
import type { SequencerSectionPatch } from "./track-authoring";
import type { PrimeTimelineDocument, SequencerSectionKind } from "./types";

type SequencerSectionInspectorProps = Readonly<{
  document: PrimeTimelineDocument;
  item: SelectedSequencerItem;
  targetName: string;
  onDelete: () => void;
  onUpdate: (patch: SequencerSectionPatch) => void;
}>;

/** Selected section fields and delete command. */
export function SequencerSectionInspector({
  document,
  item,
  targetName,
  onDelete,
  onUpdate,
}: SequencerSectionInspectorProps) {
  return (
    <div className="prime-sequencer__inspector">
      <label>
        <span>Section</span>
        <input
          className="editor-input"
          type="text"
          value={item.section.name}
          onChange={(event) => onUpdate({ name: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>Kind</span>
        <select
          className="editor-select"
          value={item.section.kind}
          onChange={(event) => onUpdate({ kind: event.currentTarget.value as SequencerSectionKind })}
        >
          {Object.entries(SECTION_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Start</span>
        <InspectorNumberInput
          value={item.section.startFrame}
          min={document.minFrame}
          max={item.section.endFrame}
          step={1}
          decimals={0}
          ariaLabel="Section start frame"
          onChange={(startFrame) => onUpdate({ startFrame })}
        />
      </label>
      <label>
        <span>End</span>
        <InspectorNumberInput
          value={item.section.endFrame}
          min={item.section.startFrame}
          max={document.maxFrame}
          step={1}
          decimals={0}
          ariaLabel="Section end frame"
          onChange={(endFrame) => onUpdate({ endFrame })}
        />
      </label>
      <label>
        <span>Target</span>
        <input className="editor-input" type="text" value={targetName} readOnly />
      </label>
      {item.section.kind === "property" && (
        <>
          <label>
            <span>Property</span>
            <input
              className="editor-input"
              type="text"
              value={item.section.propertyPath ?? ""}
              onChange={(event) => onUpdate({ propertyPath: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Value</span>
            <input
              className="editor-input"
              type="text"
              value={item.section.value?.toString() ?? ""}
              onChange={(event) => onUpdate({ value: event.currentTarget.value })}
            />
          </label>
        </>
      )}
      <label className="prime-sequencer__check">
        <EditorCheckbox
          checked={item.section.enabled}
          onChange={(event) => onUpdate({ enabled: event.currentTarget.checked })}
        />
        <span>Active</span>
      </label>
      <button
        type="button"
        className="icon-button prime-sequencer__button"
        title="Delete section"
        onClick={onDelete}
      >
        <EditorIcon name="delete" size="control" />
      </button>
    </div>
  );
}
