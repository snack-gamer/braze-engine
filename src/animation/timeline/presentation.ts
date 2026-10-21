import { curveGraph } from "./curve-graph";
import { referencesForTimelineKey, type TimelineKeyIndex } from "./selection";
import type {
  CurveViewport,
  TimelineKeyMarker,
  TimelineRow,
  ViewMode,
} from "./types";

export type TimelineCurvePresentation = {
  row: TimelineRow;
  graph: ReturnType<typeof curveGraph>;
};

export function buildCurvePresentations(
  rows: TimelineRow[],
  duration: number,
  viewport: CurveViewport,
): TimelineCurvePresentation[] {
  return rows.flatMap((row) => {
    if (row.kind !== "channel" || !row.channel) return [];
    return [{ row, graph: curveGraph(row.channel.keys, duration, viewport) }];
  });
}

type BuildTimelineMarkersInput = {
  viewMode: ViewMode;
  rows: TimelineRow[];
  curves: TimelineCurvePresentation[];
  duration: number;
  epsilon: number;
  keyIndex: TimelineKeyIndex;
};

export function buildTimelineMarkers({
  viewMode,
  rows,
  curves,
  duration,
  epsilon,
  keyIndex,
}: BuildTimelineMarkersInput): TimelineKeyMarker[] {
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  if (viewMode === "curves") {
    return curves.flatMap(({ row, graph }) =>
      graph.points.flatMap(({ key, x, y }) => {
        const refs = referencesForTimelineKey(keyIndex, row, key, epsilon);
        if (refs.length === 0) return [];
        return [{
          rowId: row.id,
          rowIndex: rowIndexById.get(row.id) ?? 0,
          time: key.time,
          value: key.value,
          refs,
          xPercent: x,
          yPercent: y,
        }];
      })
    );
  }
  return rows.flatMap((row, rowIndex) =>
    row.keys.flatMap((key) => {
      const refs = referencesForTimelineKey(keyIndex, row, key, epsilon);
      if (refs.length === 0) return [];
      return [{
        rowId: row.id,
        rowIndex,
        time: key.time,
        value: key.value,
        refs,
        xPercent: duration > 0 ? (key.time / duration) * 100 : 0,
      }];
    })
  );
}
