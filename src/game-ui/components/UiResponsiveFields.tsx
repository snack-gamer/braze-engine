import { useState } from "react";
import type { UiNode, UiStyle } from "../domain/ui-document";
import { UiStyleFields } from "./UiStyleFields";

export function UiResponsiveFields({ node, change }: { node: UiNode; change: (patch: Partial<UiNode>) => void }) {
  const [selected, select] = useState(-1), [width, setWidth] = useState(768);
  const rules = node.responsive ?? [], index = selected < rules.length ? selected : -1;
  const apply = (style: UiStyle) => change(index < 0 ? { style } : { responsive: rules.map((rule, i) => i === index ? { ...rule, style } : rule) });
  return <details open><summary>Layout and responsive styles</summary>
    <label className="ui-canvas-row">Editing<select aria-label="UI style breakpoint" value={index} onChange={(event) => select(Number(event.target.value))}>
      <option value={-1}>Base · all widths</option>{rules.map((rule, i) => <option key={rule.minWidth} value={i}>At least {rule.minWidth} px</option>)}
    </select></label>
    <div className="ui-canvas-row"><input aria-label="UI new breakpoint width" type="number" min={0} max={10000} value={width} onChange={(event) => setWidth(event.target.valueAsNumber)} />
      <button className="ghost-button compact" disabled={rules.length >= 8 || !Number.isFinite(width) || width < 0 || width > 10000 || rules.some((rule) => rule.minWidth === width)} onClick={() => {
        const next = [...rules, { minWidth: width, style: {} }].sort((a, b) => a.minWidth - b.minWidth); change({ responsive: next }); select(next.findIndex((rule) => rule.minWidth === width));
      }}>Add breakpoint</button>
      {index >= 0 && <button className="ghost-button compact" onClick={() => { change({ responsive: rules.filter((_, i) => i !== index) }); select(-1); }}>Remove breakpoint</button>}
    </div>
    <UiStyleFields key={`${node.id}-${index}`} value={index < 0 ? node.style ?? {} : rules[index].style} change={apply} />
  </details>;
}
