import { useCallback, useEffect, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { useAnimationKeyCommands } from "../hooks/useAnimationKeyCommands";
import { useCurveHandleInteraction } from "../hooks/useCurveHandleInteraction";
import { useNormalAnimationTimelineModel } from "../hooks/useNormalAnimationTimelineModel";
import type { SceneAnimationController } from "../hooks/useSceneAnimation";
import { useTimelineCanvasInteraction } from "../hooks/useTimelineCanvasInteraction";
import { useTimelineKeyInteraction } from "../hooks/useTimelineKeyInteraction";
import { useTimelinePresentation } from "../hooks/useTimelinePresentation";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { clampTime, snapTime, timePercent } from "../time";
import type { ViewMode } from "../timeline/types";
import { AnimationTimelineSurface } from "./AnimationTimelineSurface";
import { NormalAnimationToolbar } from "./NormalAnimationToolbar";

type NormalAnimationTabProps = {
  controller: SceneAnimationController;
  active: boolean;
};

export function NormalAnimationTab({ controller, active }: NormalAnimationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("dopesheet");
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  // This is intentionally a one-shot post-layout task, not a private frame loop.
  const scheduleAfterLayout = useCallback((task: () => void) => {
    window.requestAnimationFrame(task);
  }, []);
  const model = useNormalAnimationTimelineModel({ controller });
  const viewport = useTimelineViewport({
    active,
    rows: model.visibleRows,
    duration: controller.document.duration,
    viewMode,
    scheduleAfterLayout,
  });
  const presentation = useTimelinePresentation({
    viewMode,
    rows: model.visibleRows,
    duration: controller.document.duration,
    epsilon: model.epsilon,
    keyIndex: model.keyIndex,
    selectedKeyIds: model.selectedKeyIds,
    curveViewport: viewport.visibleCurveViewport,
  });
  const snapTimelineTime = useCallback(
    (time: number) => snapTime(
      clampTime(time, controller.document.duration),
      controller.document.fps,
    ),
    [controller.document.duration, controller.document.fps],
  );
  const canvas = useTimelineCanvasInteraction({
    viewMode,
    visibleCurveViewport: viewport.visibleCurveViewport,
    visibleKeyMarkers: presentation.visibleKeyMarkers,
    selectedKeyIdsRef: model.selectedKeyIdsRef,
    setSelectedKeyIds: model.setSelectedKeyIds,
    timelineContentRef: viewport.timelineContentRef,
    contentPointFromClient: viewport.contentPointFromClient,
    timeFromClientX: viewport.timeFromClientX,
    setPlayhead: controller.setPlayhead,
    panCurves: viewport.panCurves,
  });
  const keyInteraction = useTimelineKeyInteraction({
    controller,
    tracksByObject: model.tracksByObject,
    keyIndex: model.keyIndex,
    selectedKeyIdsRef: model.selectedKeyIdsRef,
    setSelectedKeyIds: model.setSelectedKeyIds,
    selectedKeyEntries: model.selectedKeyEntries,
    selectionTimeRange: presentation.selectionTimeRange,
    epsilon: model.epsilon,
    timelineContentRef: viewport.timelineContentRef,
    timeFromClientX: viewport.timeFromClientX,
    snapTimelineTime,
    setSelectedRowId: model.setSelectedRowId,
    setManualCurveViewport: viewport.setManualCurveViewport,
    refsForTimelineKey: model.refsForTimelineKey,
  });
  const curveHandles = useCurveHandleInteraction({
    controller,
    tracksByObject: model.tracksByObject,
    timelineContentRef: viewport.timelineContentRef,
    duration: controller.document.duration,
    fps: controller.document.fps,
    timeFromClientX: viewport.timeFromClientX,
    setSelectedRowId: model.setSelectedRowId,
    setManualCurveViewport: viewport.setManualCurveViewport,
  });
  const commands = useAnimationKeyCommands({
    active,
    controller,
    selectedRow: model.selectedRow,
    selectedKeyEntries: model.selectedKeyEntries,
    visibleKeyMarkers: presentation.visibleKeyMarkers,
    setSelectedKeyIds: model.setSelectedKeyIds,
    snapTimelineTime,
  });

  const setPlayheadLine = useCallback((time: number) => {
    if (playheadLineRef.current) {
      playheadLineRef.current.style.left = `${timePercent(time, controller.document.duration)}%`;
    }
  }, [controller.document.duration]);

  useEffect(() => {
    if (!active) return undefined;
    return controller.subscribePlaybackFrame(setPlayheadLine);
  }, [active, controller.subscribePlaybackFrame, setPlayheadLine]);

  if (!controller.animationPlayerRoot) {
    return (
      <div className="animation-empty-state">
        <EditorIcon name="animationPlayer" size="transport" />
        <strong>No Animation Player</strong>
        <span>Select an object and add an Animation Player component to animate it and its children.</span>
      </div>
    );
  }

  return (
    <div className="animation-normal">
      <NormalAnimationToolbar
        playerName={controller.animationPlayerRoot.name}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onKeySelected={commands.keySelected}
        canKeySelected={Boolean(model.selectedRow)}
        easingLabel={model.selectedEasingLabel}
        easingValue={model.selectedEasingValue}
        hasSelectedKeys={model.hasSelectedKeys}
        onEasingChange={model.updateSelectedEasing}
        curveVerticalZoom={viewport.curveVerticalZoom}
        onResetCurveView={viewport.resetCurveView}
        timelineZoom={viewport.timelineZoom}
        onZoomTimeline={viewport.zoomTimeline}
      />
      <AnimationTimelineSurface
        viewMode={viewMode}
        duration={controller.document.duration}
        fps={controller.document.fps}
        rows={model.visibleRows}
        curves={presentation.curves}
        selectedRowId={model.selectedRow?.id}
        expandedRows={model.expandedRows}
        selectedKeyCount={model.selectedKeyEntries.length}
        selectionRange={presentation.selectionTimeRange}
        lassoRect={canvas.lassoRect}
        treeWidthPercent={viewport.treeWidthPercent}
        timelineZoom={viewport.timelineZoom}
        resizingTree={viewport.resizingTree}
        panningTimeline={canvas.panningTimeline}
        dopesheetRef={viewport.dopesheetRef}
        treeRef={viewport.treeRef}
        timelineRef={viewport.timelineRef}
        timelineContentRef={viewport.timelineContentRef}
        playheadLineRef={playheadLineRef}
        suppressNextKeyClickRef={keyInteraction.suppressNextKeyClickRef}
        isKeySelected={model.isTimelineKeySelected}
        onSelectRow={model.setSelectedRowId}
        onToggleExpanded={model.toggleExpanded}
        onSetChannelValue={controller.setChannelValueAtPlayhead}
        onSetPlayhead={controller.setPlayhead}
        onTreeScroll={() => viewport.syncVerticalScroll("tree")}
        onTimelineScroll={() => viewport.syncVerticalScroll("timeline")}
        onStartTreeResize={viewport.startTreeResize}
        onResizeTreeWithKeyboard={viewport.resizeTreeWithKeyboard}
        onTimelinePointerDown={canvas.handlePointerDown}
        onTimelinePointerMove={canvas.handlePointerMove}
        onTimelinePointerStop={canvas.stopDragging}
        onStartKeyDrag={keyInteraction.startKeyDrag}
        onStartCurveKeyDrag={keyInteraction.startCurveKeyDrag}
        onStartCurveHandleDrag={curveHandles.startCurveHandleDrag}
        onStartSelectionStretch={keyInteraction.startSelectionStretchDrag}
      />
    </div>
  );
}
