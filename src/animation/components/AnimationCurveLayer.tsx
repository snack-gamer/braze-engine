import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AXIS_LABELS, CHANNEL_COLORS } from "../channels";
import { curveInterpolationLabel } from "../curves";
import { formatTimecode } from "../time";
import type { TimelineCurvePresentation } from "../timeline/presentation";
import type { TimelineKey, TimelineRow } from "../timeline/types";
import type { TransformChannelKeyframe } from "../types";

type AnimationCurveLayerProps = {
  curves: TimelineCurvePresentation[];
  selectedRowId?: string;
  fps: number;
  isKeySelected: (row: TimelineRow, key: TimelineKey) => boolean;
  onStartKeyDrag: (
    row: TimelineRow,
    key: TransformChannelKeyframe,
    graph: TimelineCurvePresentation["graph"],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onStartHandleDrag: (
    row: TimelineRow,
    key: TransformChannelKeyframe,
    side: "in" | "out",
    graph: TimelineCurvePresentation["graph"],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

function curveColor(row: TimelineRow): string {
  const axisLabel = row.axis !== undefined ? AXIS_LABELS[row.axis] : "X";
  return row.axis !== undefined ? CHANNEL_COLORS[axisLabel] : "#d0a548";
}

export function AnimationCurveLayer({
  curves,
  selectedRowId,
  fps,
  isKeySelected,
  onStartKeyDrag,
  onStartHandleDrag,
}: AnimationCurveLayerProps) {
  return (
    <div className="animation-curve-layer">
      <svg
        className="animation-curve-graph"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {curves.map(({ row, graph }) => (
          <path key={row.id} className="animation-curve-path" d={graph.path} stroke={curveColor(row)} />
        ))}
        {curves.flatMap(({ row, graph }) => {
          if (selectedRowId !== row.id) return [];
          return graph.handles
            .filter(({ key }) => isKeySelected(row, key))
            .map((handle) => (
              <line
                key={`${row.id}:${handle.key.id}-${handle.side}`}
                className="animation-curve-handle-line"
                x1={handle.keyX}
                y1={handle.keyY}
                x2={handle.x}
                y2={handle.y}
              />
            ));
        })}
      </svg>
      {curves.flatMap(({ row, graph }) => {
        if (selectedRowId !== row.id) return [];
        const color = curveColor(row);
        return graph.handles
          .filter(({ key }) => isKeySelected(row, key))
          .map((handle) => (
            <button
              key={`${row.id}:${handle.key.id}-${handle.side}`}
              type="button"
              className="animation-curve-handle"
              style={{
                left: `${handle.x}%`,
                top: `${handle.y}%`,
                "--key-color": color,
              } as CSSProperties}
              onPointerDown={(event) => onStartHandleDrag(row, handle.key, handle.side, graph, event)}
              title={`${handle.side === "in" ? "In" : "Out"} tangent`}
            />
          ));
      })}
      {curves.flatMap(({ row, graph }) => {
        const color = curveColor(row);
        return graph.points.map(({ key, x, y }) => (
          <button
            key={`${row.id}:${key.id}`}
            type="button"
            className={isKeySelected(row, key)
              ? "animation-curve-point selected"
              : "animation-curve-point"}
            style={{ left: `${x}%`, top: `${y}%`, "--key-color": color } as CSSProperties}
            onPointerDown={(event) => onStartKeyDrag(row, key, graph, event)}
            title={`${formatTimecode(key.time, fps)} · ${curveInterpolationLabel(key.interpolation)}`}
          />
        ));
      })}
    </div>
  );
}
