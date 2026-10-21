import {
  patchBuoyancyPinOffset,
} from "../../../modifiers/authoring/buoyancy-pins";
import type { BuoyancyPin } from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { InspectorNumberInput } from "../../InspectorNumberInput";

type BuoyancyPinEditorProps = {
  pin: BuoyancyPin;
  selected: boolean;
  selectPin: () => void;
  canRemove: boolean;
  patchPin: (pinId: string, value: Partial<BuoyancyPin>) => void;
  removePin: (pinId: string) => void;
};

export function BuoyancyPinEditor({
  pin,
  selected,
  selectPin,
  canRemove,
  patchPin,
  removePin,
}: BuoyancyPinEditorProps) {
  return (
    <div
      className={`modifier-pin-row ${selected ? "selected" : ""}`}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) return;
        selectPin();
      }}
    >
      <input
        className="modifier-pin-title"
        value={pin.name}
        aria-label="Buoyancy pin name"
        onChange={(event) => patchPin(pin.id, { name: event.target.value })}
      />
      {pin.localOffset.map((value, axis) => (
        <InspectorNumberInput
          key={axis}
          value={value}
          min={-50}
          max={50}
          step={0.05}
          decimals={2}
          ariaLabel={`${pin.name} ${["X", "Y", "Z"][axis]}`}
          onChange={(next) => patchPin(pin.id, {
            localOffset: patchBuoyancyPinOffset(pin.localOffset, axis as 0 | 1 | 2, next),
          })}
        />
      ))}
      <button
        className="icon-button danger"
        type="button"
        title="Remove pin"
        disabled={!canRemove}
        onClick={() => removePin(pin.id)}
      >
        <EditorIcon name="delete" size="control" />
      </button>
    </div>
  );
}
