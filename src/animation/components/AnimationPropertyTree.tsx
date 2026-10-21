import type { CSSProperties, RefObject } from "react";
import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { EditorIcon } from "../../ui/EditorIcon";
import { AXIS_LABELS, CHANNEL_COLORS } from "../channels";
import type { TransformAxis, TransformProperty } from "../types";
import type { TimelineRow } from "../timeline/types";

type AnimationPropertyTreeProps = {
  treeRef: RefObject<HTMLDivElement | null>;
  rows: TimelineRow[];
  selectedRowId?: string;
  expandedRows: ReadonlySet<string>;
  onSelectRow: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onScroll: () => void;
  onSetChannelValue: (
    target: { objectId: string; property: TransformProperty; axis: TransformAxis },
    value: number,
  ) => void;
};

export function AnimationPropertyTree({
  treeRef,
  rows,
  selectedRowId,
  expandedRows,
  onSelectRow,
  onToggleExpanded,
  onScroll,
  onSetChannelValue,
}: AnimationPropertyTreeProps) {
  return (
    <div ref={treeRef} className="animation-tree" onScroll={onScroll}>
      {rows.map((row) => {
        const canExpand = row.kind !== "channel";
        const expanded = expandedRows.has(row.id);
        return (
          <div
            key={row.id}
            className={`animation-tree-row ${row.kind} ${selectedRowId === row.id ? "selected" : ""}`}
            style={{ "--anim-depth": row.depth } as CSSProperties}
            onClick={() => onSelectRow(row.id)}
          >
            {canExpand ? (
              <button
                type="button"
                className={expanded ? "animation-tree-toggle expanded" : "animation-tree-toggle"}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectRow(row.id);
                  onToggleExpanded(row.id);
                }}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${row.label}`}
                aria-expanded={expanded}
              >
                <EditorIcon name="disclosureClosed" size="compact" />
              </button>
            ) : (
              <span className="animation-tree-spacer" />
            )}
            <button type="button" className="animation-tree-label" onClick={() => onSelectRow(row.id)}>
              <span>{row.label}</span>
            </button>
            {row.kind === "channel" && row.axis !== undefined && (
              <span
                className="animation-channel-number"
                style={{ "--channel-color": CHANNEL_COLORS[AXIS_LABELS[row.axis]] } as CSSProperties}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <InspectorNumberInput
                  value={row.value ?? 0}
                  step={row.property === "rotation" ? 1 : 0.05}
                  decimals={2}
                  ariaLabel={`${row.label} value`}
                  onChange={(value) => {
                    if (row.property === undefined || row.axis === undefined) return;
                    onSetChannelValue(
                      { objectId: row.objectId, property: row.property, axis: row.axis },
                      value,
                    );
                  }}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
