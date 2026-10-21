import { describe, expect, it } from "vitest";
import type { TransformChannelKeyframeRef } from "../types";
import {
  curveHandleTangent,
  moveKeyTimes,
  moveKeyValues,
  resolveCurveDragAxis,
  stretchKeyTimes,
  type KeyDragSnapshot,
} from "./drag-calculations";
import {
  copyTimelineKeys,
  pasteTimelineKeys,
  pastedKeySelection,
} from "./key-clipboard";
import {
  indexTimelineKeys,
  keyIdsInsideLasso,
  referencesForTimelineKey,
  selectedTimelineRange,
  selectionAfterKeyPress,
} from "./selection";
import type { TimelineKeyEntry, TimelineKeyMarker, TimelineRow } from "./types";
import {
  createTimelineZoomAnchor,
  panCurveViewport,
  scrollLeftForZoomAnchor,
  timelineContentPoint,
  timelineTimeFromClientX,
  zoomCurveViewport,
} from "./viewport-coordinates";

function entry(
  keyframeId: string,
  time: number,
  axis: 0 | 1 | 2 = 0,
  value = time * 10,
): TimelineKeyEntry {
  const ref = { trackId: "track", channelId: `channel-${axis}`, keyframeId };
  return {
    id: `${ref.trackId}:${ref.channelId}:${ref.keyframeId}`,
    ref,
    objectId: "cube",
    property: "position",
    axis,
    key: { id: keyframeId, time, value, interpolation: "linear" },
  };
}

function channelRow(axis: 0 | 1 | 2 = 0): TimelineRow {
  return {
    id: `channel:cube:position:${axis}`,
    kind: "channel",
    objectId: "cube",
    label: "X",
    depth: 2,
    property: "position",
    axis,
    keys: [],
  };
}

describe("timeline key selection", () => {
  it("indexes keys by row scope and includes same-frame aggregate keys", () => {
    const entries = [entry("x", 1, 0), entry("y", 1.002, 1), entry("late", 2, 0)];
    const index = indexTimelineKeys(entries);
    const propertyRow: TimelineRow = {
      ...channelRow(),
      id: "property:cube:position",
      kind: "property",
      axis: undefined,
    };
    expect(referencesForTimelineKey(index, propertyRow, { id: "x", time: 1 }, 0.01))
      .toEqual([entries[0].ref, entries[1].ref]);
    expect(referencesForTimelineKey(index, channelRow(0), { id: "x", time: 1 }, 0.01))
      .toEqual([entries[0].ref]);
  });

  it("supports replacement, extension, toggling, and stable multi-key dragging", () => {
    const current = new Set(["a", "b"]);
    expect(selectionAfterKeyPress(current, ["c"], { extend: false, toggle: false }))
      .toEqual({ selectedIds: new Set(["c"]), dragIds: new Set(["c"]) });
    expect(selectionAfterKeyPress(current, ["c"], { extend: true, toggle: false }))
      .toEqual({ selectedIds: new Set(["a", "b", "c"]), dragIds: new Set(["a", "b", "c"]) });
    expect(selectionAfterKeyPress(current, ["b"], { extend: false, toggle: true }))
      .toEqual({ selectedIds: new Set(["a"]), dragIds: new Set(["a"]) });
    expect(selectionAfterKeyPress(current, ["b"], { extend: false, toggle: false }).dragIds)
      .toEqual(current);
  });

  it("lassos row and curve markers and derives the selected time range", () => {
    const refs: TransformChannelKeyframeRef[] = [
      { trackId: "t", channelId: "c", keyframeId: "a" },
      { trackId: "t", channelId: "c", keyframeId: "b" },
    ];
    const markers: TimelineKeyMarker[] = [
      { rowId: "a", rowIndex: 0, time: 1, refs: [refs[0]], xPercent: 25, yPercent: 70 },
      { rowId: "b", rowIndex: 2, time: 3, refs: [refs[1]], xPercent: 75, yPercent: 20 },
    ];
    expect(keyIdsInsideLasso(
      markers,
      { left: 20, top: 0, width: 10, height: 24 },
      { width: 100, height: 100 },
      false,
    )).toEqual(new Set(["t:c:a"]));
    expect(keyIdsInsideLasso(
      markers,
      { left: 70, top: 15, width: 10, height: 10 },
      { width: 100, height: 100 },
      true,
    )).toEqual(new Set(["t:c:b"]));
    expect(selectedTimelineRange(markers, new Set(["t:c:a", "t:c:b"]), 4)).toEqual({
      minTime: 1,
      maxTime: 3,
      leftPercent: 25,
      widthPercent: 50,
    });
  });
});

describe("timeline drag calculations", () => {
  const selection: KeyDragSnapshot[] = [
    { ref: { trackId: "t", channelId: "x", keyframeId: "a" }, startTime: 1, startValue: 2 },
    { ref: { trackId: "t", channelId: "y", keyframeId: "b" }, startTime: 2, startValue: -1 },
  ];

  it("locks curve dragging to the dominant axis after the movement threshold", () => {
    expect(resolveCurveDragAxis(null, 3, 4)).toBeNull();
    expect(resolveCurveDragAxis(null, 8, 5)).toBe("time");
    expect(resolveCurveDragAxis(null, 5, 8)).toBe("value");
    expect(resolveCurveDragAxis("time", 0, 100)).toBe("time");
  });

  it("moves and stretches every selected key from its immutable drag snapshot", () => {
    expect(moveKeyTimes(selection, 1, 1.5).map((update) => update.time)).toEqual([1.5, 2.5]);
    expect(moveKeyValues(selection, 2, 5).map((update) => update.value)).toEqual([5, 2]);
    expect(stretchKeyTimes(selection, 1, 2, 3).map((update) => update.time)).toEqual([1, 3]);
    expect(stretchKeyTimes(selection, 1, 1, 3)).toEqual([]);
  });

  it("keeps tangent handles on their respective side of the key", () => {
    expect(curveHandleTangent({
      side: "out", rawTime: 0, value: 3, keyTime: 1, keyValue: 2, fps: 10, duration: 2,
    })).toBeCloseTo(10);
    expect(curveHandleTangent({
      side: "in", rawTime: 2, value: 3, keyTime: 1, keyValue: 2, fps: 10, duration: 2,
    })).toBeCloseTo(-10);
  });
});

describe("timeline clipboard commands", () => {
  it("copies relative timing and pastes at a new playhead without sharing ids", () => {
    const clipboard = copyTimelineKeys([entry("a", 2, 0, 7), entry("b", 3.5, 1, 9)]);
    expect(clipboard.map((item) => item.offset)).toEqual([0, 1.5]);
    const inserts = pasteTimelineKeys(clipboard, 10, (index) => `copy-${index}`);
    expect(inserts.map((insert) => [insert.keyframe.id, insert.keyframe.time, insert.keyframe.value]))
      .toEqual([["copy-0", 10, 7], ["copy-1", 11.5, 9]]);
    expect(pastedKeySelection(inserts)).toEqual(new Set([
      "track:channel-0:copy-0",
      "track:channel-1:copy-1",
    ]));
  });
});

describe("timeline viewport calculations", () => {
  it("maps and clamps browser coordinates into timeline space", () => {
    const rect = { left: 20, top: 10, width: 200, height: 100 };
    expect(timelineTimeFromClientX(120, rect, 8)).toBe(4);
    expect(timelineTimeFromClientX(-50, rect, 8)).toBe(0);
    expect(timelineTimeFromClientX(500, rect, 8)).toBe(8);
    expect(timelineContentPoint(70, 40, rect)).toEqual({ x: 50, y: 30, width: 200, height: 100 });
  });

  it("preserves the content under the pointer while timeline width changes", () => {
    const anchor = createTimelineZoomAnchor({
      anchorClientX: 150,
      rectLeft: 100,
      viewportWidth: 200,
      scrollWidth: 400,
      scrollLeft: 100,
    });
    expect(anchor).toEqual({ viewportX: 50, contentRatio: 0.375 });
    expect(scrollLeftForZoomAnchor(anchor, 800, 200)).toBe(250);
  });

  it("pans and zooms the curve viewport around its current center", () => {
    expect(panCurveViewport({ minValue: -2, maxValue: 2 }, 25, 100))
      .toEqual({ minValue: -1, maxValue: 3 });
    expect(zoomCurveViewport({ minValue: -2, maxValue: 2 }, 2))
      .toEqual({ minValue: -1, maxValue: 1 });
  });
});
