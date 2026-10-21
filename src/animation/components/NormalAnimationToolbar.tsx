import { EditorIcon } from "../../ui/EditorIcon";
import { CURVE_INTERPOLATION_OPTIONS } from "../curves";
import {
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  TIMELINE_ZOOM_STEP,
} from "../timeline/layout";
import type { ViewMode } from "../timeline/types";

type NormalAnimationToolbarProps = {
  playerName: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onKeySelected: () => void;
  canKeySelected: boolean;
  easingLabel: string;
  easingValue: string;
  hasSelectedKeys: boolean;
  onEasingChange: (value: string) => void;
  curveVerticalZoom: number;
  onResetCurveView: () => void;
  timelineZoom: number;
  onZoomTimeline: (factor: number) => void;
};

export function NormalAnimationToolbar({
  playerName,
  viewMode,
  onViewModeChange,
  onKeySelected,
  canKeySelected,
  easingLabel,
  easingValue,
  hasSelectedKeys,
  onEasingChange,
  curveVerticalZoom,
  onResetCurveView,
  timelineZoom,
  onZoomTimeline,
}: NormalAnimationToolbarProps) {
  return (
    <div className="animation-normal__bar">
      <strong>{playerName || "Animation Player"}</strong>
      <div className="editor-segmented animation-subtabs" role="tablist" aria-label="Normal animation view">
        <button type="button" className={viewMode === "dopesheet" ? "active" : ""} onClick={() => onViewModeChange("dopesheet")}>
          Dopesheet
        </button>
        <button type="button" className={viewMode === "curves" ? "active" : ""} onClick={() => onViewModeChange("curves")}>
          Curves
        </button>
      </div>
      <button type="button" className="ghost-button collapse-to-icon animation-key-button" onClick={onKeySelected} disabled={!canKeySelected}>
        <EditorIcon name="addKeyframe" size="control" />
        <span>Key selected</span>
      </button>
      <label className="animation-easing-control" title={`Selected key easing: ${easingLabel}`}>
        <span>Easing</span>
        <select
          className="editor-select"
          value={easingValue}
          onChange={(event) => onEasingChange(event.target.value)}
          disabled={!canKeySelected || !hasSelectedKeys}
        >
          {!hasSelectedKeys && <option value="">No key</option>}
          {easingValue === "mixed" && <option value="mixed">Mixed</option>}
          {CURVE_INTERPOLATION_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      {viewMode === "curves" && (
        <button
          type="button"
          className="ghost-button animation-curve-zoom-readout"
          onClick={onResetCurveView}
          title="Reset vertical curve view"
        >
          V {Math.round(curveVerticalZoom * 100)}%
        </button>
      )}
      <div className="animation-zoom-controls" aria-label="Timeline zoom">
        <button
          type="button"
          className="icon-button compact animation-zoom-button"
          onClick={() => onZoomTimeline(1 / TIMELINE_ZOOM_STEP)}
          disabled={timelineZoom <= MIN_TIMELINE_ZOOM}
          title="Zoom out"
          aria-label="Zoom timeline out"
        >
          <EditorIcon name="zoomOut" size="control" />
        </button>
        <span>{Math.round(timelineZoom * 100)}%</span>
        <button
          type="button"
          className="icon-button compact animation-zoom-button"
          onClick={() => onZoomTimeline(TIMELINE_ZOOM_STEP)}
          disabled={timelineZoom >= MAX_TIMELINE_ZOOM}
          title="Zoom in"
          aria-label="Zoom timeline in"
        >
          <EditorIcon name="zoomIn" size="control" />
        </button>
      </div>
    </div>
  );
}
