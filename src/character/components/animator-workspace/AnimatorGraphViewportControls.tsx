import { EditorIcon } from "../../../ui/EditorIcon";

type AnimatorGraphViewportControlsProps = Readonly<{
  scale: number;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onFrame: () => void;
  onAutoArrange: () => void;
}>;

export function AnimatorGraphViewportControls({
  scale,
  onZoomOut,
  onReset,
  onZoomIn,
  onFrame,
  onAutoArrange,
}: AnimatorGraphViewportControlsProps) {
  return (
    <>
      <div className="animator-graph-pan-hint" aria-hidden="true">
        Left drag to select · Middle drag to pan · Scroll to zoom
      </div>
      <div className="animator-graph-viewport-controls" role="toolbar" aria-label="Graph view controls">
        <button
          type="button"
          className="icon-button compact animator-graph-auto-arrange"
          title="Auto Arrange"
          aria-label="Auto Arrange"
          onClick={onAutoArrange}
        >
          <EditorIcon name="autoArrange" size="row-action" />
        </button>
        <button type="button" className="icon-button compact" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}>
          <EditorIcon name="zoomOut" size="row-action" />
        </button>
        <button type="button" className="ghost-button compact animator-graph-zoom" title="Reset graph view" onClick={onReset}>
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="icon-button compact" title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}>
          <EditorIcon name="zoomIn" size="row-action" />
        </button>
        <button type="button" className="icon-button compact" title="Frame all nodes" aria-label="Frame all nodes" onClick={onFrame}>
          <EditorIcon name="frameSelection" size="row-action" />
        </button>
      </div>
    </>
  );
}
