import type { SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { toneClassName } from "../../ui/tones";
import { hierarchyComponentIndicators } from "../hierarchy-presentation";

export function HierarchyComponentIndicators({ object }: { object: SceneObject }) {
  const indicators = hierarchyComponentIndicators(object);
  if (indicators.length === 0) return <span className="modifier-tags" aria-hidden />;
  return (
    <span className="modifier-tags" aria-label="Installed components">
      {indicators.map((indicator) => (
        <span
          key={indicator.id}
          className={`modifier-tag modifier-tag--${indicator.family} ${toneClassName(indicator.tone)} ${indicator.enabled ? "" : "disabled"}`}
          title={`${indicator.label}${indicator.count > 1 ? ` ×${indicator.count}` : ""}${indicator.enabled ? "" : " — disabled"}`}
          data-hierarchy-component-id={indicator.id}
        >
          <EditorIcon name={indicator.icon} size="indicator" weight="strong" />
          {indicator.count > 1 && <span className="hierarchy-component-count">{indicator.count}</span>}
        </span>
      ))}
    </span>
  );
}
