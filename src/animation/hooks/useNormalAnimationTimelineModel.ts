import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { curveInterpolation, curveInterpolationLabel } from "../curves";
import type { SceneAnimationController } from "./useSceneAnimation";
import { frameEpsilon } from "../time";
import type { CurveInterpolation } from "../types";
import { collectTimelineKeyEntries, buildTimelineRows, visibleTimelineRows } from "../timeline/rows";
import {
  entriesForSelectedKeyIds,
  indexTimelineKeys,
  referencesForTimelineKey,
  retainValidKeySelection,
} from "../timeline/selection";
import { keyRefId } from "../timeline/keyframes";
import type { TimelineKey, TimelineRow } from "../timeline/types";

type TimelineModelOptions = {
  controller: SceneAnimationController;
};

export function useNormalAnimationTimelineModel({
  controller,
}: TimelineModelOptions) {
  const [selectedRowId, setSelectedRowId] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(() => new Set());
  const selectedKeyIdsRef = useRef(new Set<string>());
  const { animatableRows, document, evaluatedObjects, transformTracks } = controller;
  const epsilon = frameEpsilon(document.fps);

  const tracksByObject = useMemo(
    () => new Map(transformTracks.map((track) => [track.objectId, track])),
    [transformTracks],
  );
  const allKeyEntries = useMemo(
    () => collectTimelineKeyEntries(transformTracks),
    [transformTracks],
  );
  const keyIndex = useMemo(() => indexTimelineKeys(allKeyEntries), [allKeyEntries]);
  const selectedKeyEntries = useMemo(
    () => entriesForSelectedKeyIds(selectedKeyIds, keyIndex),
    [keyIndex, selectedKeyIds],
  );
  const rows = useMemo(
    () => buildTimelineRows(animatableRows, evaluatedObjects, transformTracks),
    [animatableRows, evaluatedObjects, transformTracks],
  );
  const visibleRows = useMemo(
    () => visibleTimelineRows(rows, expandedRows),
    [expandedRows, rows],
  );
  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.id === selectedRowId) ?? visibleRows[0],
    [selectedRowId, visibleRows],
  );
  useEffect(() => {
    selectedKeyIdsRef.current = selectedKeyIds;
  }, [selectedKeyIds]);

  useEffect(() => {
    setSelectedKeyIds((current) => {
      const next = retainValidKeySelection(current, keyIndex);
      return next.size === current.size ? current : next;
    });
  }, [keyIndex]);

  useEffect(() => {
    if (!selectedRow || visibleRows.some((row) => row.id === selectedRowId)) return;
    setSelectedRowId(selectedRow.id);
  }, [selectedRow, selectedRowId, visibleRows]);

  const toggleExpanded = useCallback((rowId: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const refsForTimelineKey = useCallback(
    (row: TimelineRow, key: Pick<TimelineKey, "time" | "id">) =>
      referencesForTimelineKey(keyIndex, row, key, epsilon),
    [epsilon, keyIndex],
  );
  const isTimelineKeySelected = useCallback(
    (row: TimelineRow, key: Pick<TimelineKey, "time" | "id">) =>
      refsForTimelineKey(row, key).some((ref) => selectedKeyIds.has(keyRefId(ref))),
    [refsForTimelineKey, selectedKeyIds],
  );

  const selectedKeyInterpolations = useMemo(
    () => selectedKeyEntries.map((entry) => entry.key.interpolation),
    [selectedKeyEntries],
  );
  const selectedEasingValue = useMemo(() => {
    if (selectedKeyInterpolations.length === 0) return "";
    const first = selectedKeyInterpolations[0];
    return selectedKeyInterpolations.every((value) => value === first) ? first : "mixed";
  }, [selectedKeyInterpolations]);
  const selectedEasingLabel = selectedEasingValue === "mixed"
    ? "Mixed"
    : selectedEasingValue
      ? curveInterpolationLabel(selectedEasingValue as CurveInterpolation)
      : "No key";
  const updateSelectedEasing = useCallback((value: string) => {
    if (!value || value === "mixed" || selectedKeyEntries.length === 0) return;
    const interpolation = curveInterpolation(value);
    controller.updateChannelKeyframes(selectedKeyEntries.map((entry) => ({
      ...entry.ref,
      interpolation,
    })));
  }, [controller, selectedKeyEntries]);

  return {
    tracksByObject,
    keyIndex,
    selectedKeyEntries,
    selectedKeyIds,
    selectedKeyIdsRef,
    setSelectedKeyIds,
    selectedRow,
    setSelectedRowId,
    expandedRows,
    toggleExpanded,
    visibleRows,
    epsilon,
    refsForTimelineKey,
    isTimelineKeySelected,
    selectedEasingValue,
    selectedEasingLabel,
    hasSelectedKeys: selectedKeyInterpolations.length > 0,
    updateSelectedEasing,
  };
}
