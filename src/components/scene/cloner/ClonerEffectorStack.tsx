import {
  clonerEffectorIds,
  moveClonerEffector,
} from "../../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings, SceneObject } from "../../../types";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorRow } from "../../InspectorRow";

type Props = {
  cloner: ClonerSettings;
  objects: SceneObject[];
  patchCloner: (patch: Partial<ClonerSettings>) => void;
};

export function ClonerEffectorStack({ cloner, objects, patchCloner }: Props) {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const { stack, available } = clonerEffectorIds(objects, cloner.effectorIds);
  const setStack = (effectorIds: string[]) => patchCloner({ effectorIds });

  return (
    <InspectorGroup id="cloner.effectorStack" title="Effectors" meta={stack.length}>
      {stack.map((id, index) => {
        const item = byId.get(id);
        if (!item) return null;
        const disabled = item.effector?.enabled === false || item.visible === false;
        return (
          <div key={id} className="cloner-effector-stack-row" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
              {item.name}
              <em style={{ opacity: 0.6, marginLeft: 6 }}>{item.effector?.type ?? "random"}</em>
            </span>
            <button
              type="button"
              title="Move up"
              disabled={index === 0}
              onClick={() => {
                const next = moveClonerEffector(stack, index, -1);
                if (next) setStack(next);
              }}
            >↑</button>
            <button
              type="button"
              title="Move down"
              disabled={index === stack.length - 1}
              onClick={() => {
                const next = moveClonerEffector(stack, index, 1);
                if (next) setStack(next);
              }}
            >↓</button>
            <button type="button" title="Remove" onClick={() => setStack(stack.filter((other) => other !== id))}>✕</button>
          </div>
        );
      })}
      {available.length > 0 && (
        <InspectorRow label="Add">
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setStack([...stack, event.target.value]);
            }}
          >
            <option value="">Pick effector…</option>
            {available.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </InspectorRow>
      )}
      {stack.length === 0 && available.length === 0 && (
        <p className="empty-note cloner-state-note">Add an Effector object to the scene, then link it here.</p>
      )}
    </InspectorGroup>
  );
}
