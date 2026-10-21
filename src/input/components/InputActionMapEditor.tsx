import { INPUT_LIMITS, type InputAction, type InputActionMap } from "../domain/action-map";
import { appendInputAction, changeInputActionKind, defaultInputBinding } from "../application/input-action-map-editing";
import { InputBindingEditor } from "./InputBindingEditor";

export function InputActionMapEditor({ map, disabled, onChange }: {
  map: InputActionMap;
  disabled: boolean;
  onChange: (map: InputActionMap) => void;
}) {
  const update = (index: number, action: InputAction) => onChange({ ...map,
    actions: map.actions.map((current, candidate) => candidate === index ? action : current) });
  return <fieldset className="input-map__actions" disabled={disabled}>
    <legend>Actions</legend>
    <p className="input-map__hint">Buttons are held or pressed; axes combine scaled values; deltas report motion. Pointer delta requires Delta.</p>
    {map.actions.map((action, index) => <section className="input-map__action" key={index} aria-label={`Action ${index + 1}`}>
      <div className="input-map__action-fields">
        <label>Name<input aria-label={`Action ${index + 1} name`} maxLength={64} value={action.name}
          onChange={(event) => update(index, { ...action, name: event.target.value })} /></label>
        <label>Kind<select className="editor-select" aria-label={`Action ${index + 1} kind`} value={action.kind}
          onChange={(event) => update(index, changeInputActionKind(action, event.target.value as InputAction["kind"]))}>
          <option value="button">Button</option><option value="axis">Axis</option><option value="delta">Delta</option>
        </select></label>
        <button type="button" className="ghost-button danger" aria-label={`Remove action ${index + 1}`}
          onClick={() => onChange({ ...map, actions: map.actions.filter((_, candidate) => candidate !== index) })}>Remove action</button>
      </div>
      {action.bindings.map((binding, bindingIndex) => <InputBindingEditor key={bindingIndex} binding={binding}
        actionKind={action.kind} label={`Action ${index + 1} binding ${bindingIndex + 1}`}
        onChange={(next) => update(index, { ...action,
          bindings: action.bindings.map((current, candidate) => candidate === bindingIndex ? next : current) })}
        onRemove={() => update(index, { ...action, bindings: action.bindings.filter((_, candidate) => candidate !== bindingIndex) })} />)}
      <button type="button" className="ghost-button" aria-label={`Add binding to action ${index + 1}`}
        disabled={action.bindings.length >= INPUT_LIMITS.bindings}
        onClick={() => update(index, { ...action, bindings: [...action.bindings, defaultInputBinding("keyboard")] })}>Add binding</button>
    </section>)}
    {map.actions.length === 0 && <p className="input-map__hint">No actions yet. Add an action and its device bindings.</p>}
    <button type="button" className="ghost-button" disabled={map.actions.length >= INPUT_LIMITS.actions}
      onClick={() => onChange(appendInputAction(map))}>Add action</button>
    <p className="input-map__hint">{map.actions.length} / {INPUT_LIMITS.actions} actions · up to {INPUT_LIMITS.bindings} bindings each</p>
  </fieldset>;
}
