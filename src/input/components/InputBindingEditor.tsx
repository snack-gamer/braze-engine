import type { InputAction, InputBinding } from "../domain/action-map";
import { defaultInputBinding } from "../application/input-action-map-editing";

type Props = {
  binding: InputBinding;
  actionKind: InputAction["kind"];
  label: string;
  onChange: (binding: InputBinding) => void;
  onRemove: () => void;
};
const devices: readonly [InputBinding["device"], string][] = [
  ["keyboard", "Keyboard"], ["pointer-button", "Pointer button"], ["pointer-delta", "Pointer delta"],
  ["gamepad-button", "Gamepad button"], ["gamepad-axis", "Gamepad axis"],
];

export function InputBindingEditor({ binding, actionKind, label, onChange, onRemove }: Props) {
  return <div className="input-map__binding">
    <label>Device<select aria-label={`${label} device`} className="editor-select" value={binding.device}
      onChange={(event) => onChange(defaultInputBinding(event.target.value as InputBinding["device"]))}>
      {devices.map(([device, name]) => <option key={device} value={device}
        disabled={device === "pointer-delta" && actionKind !== "delta"}>{name}</option>)}
    </select></label>
    {binding.device === "keyboard" && <label>Code<input aria-label={`${label} keyboard code`}
      maxLength={64} value={binding.code} placeholder="KeyW" onChange={(event) => onChange({ ...binding, code: event.target.value })} /></label>}
    {(binding.device === "pointer-button" || binding.device === "gamepad-button") && <label>Button<input type="number"
      aria-label={`${label} button`} min={0} max={binding.device === "pointer-button" ? 4 : 31} step={1}
      value={binding.button} onChange={(event) => onChange({ ...binding, button: Number(event.target.value) })} /></label>}
    {binding.device === "pointer-delta" && <label>Axis<select aria-label={`${label} pointer axis`}
      className="editor-select" value={binding.axis} onChange={(event) => onChange({ ...binding, axis: event.target.value as "x" | "y" })}>
      <option value="x">X</option><option value="y">Y</option>
    </select></label>}
    {binding.device === "gamepad-axis" && <>
      <label>Axis<input type="number" aria-label={`${label} gamepad axis`} min={0} max={7} step={1}
        value={binding.axis} onChange={(event) => onChange({ ...binding, axis: Number(event.target.value) })} /></label>
      <label>Deadzone<input type="number" aria-label={`${label} deadzone`} min={0} max={0.99} step={0.01}
        value={binding.deadzone ?? 0.15} onChange={(event) => onChange({ ...binding, deadzone: Number(event.target.value) })} /></label>
    </>}
    <label>Scale<input type="number" aria-label={`${label} scale`} min={-100} max={100} step={0.1}
      value={binding.scale ?? 1} onChange={(event) => onChange({ ...binding, scale: Number(event.target.value) })} /></label>
    <button type="button" className="ghost-button danger" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>Remove</button>
  </div>;
}
