import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent } from "react";
import { AXIS_LABELS, CHANNEL_COLORS } from "../channels";
import { formatTimecode, timePercent } from "../time";
import type { TimelineKey, TimelineRow } from "../timeline/types";

type AnimationTimelineRowsProps = {
  rows: TimelineRow[];
  selectedRowId?: string;
  showKeys: boolean;
  duration: number;
  fps: number;
  suppressNextKeyClickRef: MutableRefObject<boolean>;
  isKeySelected: (row: TimelineRow, key: TimelineKey) => boolean;
  onSelectRow: (rowId: string) => void;
  onSetPlayhead: (time: number) => void;
  onStartKeyDrag: (
    row: TimelineRow,
    key: TimelineKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function AnimationTimelineRows({
  rows,
  selectedRowId,
  showKeys,
  duration,
  fps,
  suppressNextKeyClickRef,
  isKeySelected,
  onSelectRow,
  onSetPlayhead,
  onStartKeyDrag,
}: AnimationTimelineRowsProps) {
  return rows.map((row) => {
    const axisLabel = row.axis !== undefined ? AXIS_LABELS[row.axis] : "X";
    const color = row.axis !== undefined ? CHANNEL_COLORS[axisLabel] : "#d0a548";
    return (
      <div
        key={row.id}
        className={`animation-dopesheet-row ${row.kind} ${selectedRowId === row.id ? "selected" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSelectRow(row.id);
        }}
      >
        {showKeys && row.keys.map((key) => (
          <button
            key={key.id}
            type="button"
            className={isKeySelected(row, key)
              ? "animation-dopesheet-key selected"
              : "animation-dopesheet-key"}
            style={{
              left: `${timePercent(key.time, duration)}%`,
              "--key-color": color,
            } as CSSProperties}
            onPointerDown={(event) => onStartKeyDrag(row, key, event)}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressNextKeyClickRef.current) {
                suppressNextKeyClickRef.current = false;
                return;
              }
              onSelectRow(row.id);
              onSetPlayhead(key.time);
            }}
            title={formatTimecode(key.time, fps)}
          />
        ))}
      </div>
    );
  });
}
