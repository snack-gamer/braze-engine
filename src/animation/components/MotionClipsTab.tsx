import { useCallback, useEffect, useMemo, useRef, type PointerEvent } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import type { SceneAnimationController } from "../hooks/useSceneAnimation";
import { timePercent } from "../time";
import { MotionClipEditor } from "./MotionClipEditor";

type MotionClipsTabProps = {
  controller: SceneAnimationController;
  active: boolean;
};

export function MotionClipsTab({ controller, active }: MotionClipsTabProps) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const { activeMotionTrack, document, motionClipSources } = controller;
  const motionClips = useMemo(
    () => [...(activeMotionTrack?.clips ?? [])].sort((a, b) => a.start - b.start),
    [activeMotionTrack],
  );
  const playheadPercent = timePercent(controller.displayPlayhead, document.duration);
  const updatePlayhead = useCallback((time: number) => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${timePercent(time, document.duration)}%`;
    }
  }, [document.duration]);

  useEffect(() => {
    if (!active) return undefined;
    return controller.subscribePlaybackFrame(updatePlayhead);
  }, [active, controller.subscribePlaybackFrame, updatePlayhead]);

  const setTimeFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
      controller.setPlayhead(ratio * document.duration);
    },
    [controller, document.duration],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setTimeFromPointer(event);
    },
    [setTimeFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) setTimeFromPointer(event);
    },
    [setTimeFromPointer],
  );

  const stopDragging = useCallback((event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="animation-tab-panel">
      <div className="animation-track-row animation-track-row--motion">
        <div className="animation-track-label">
          <span>Motion Clips</span>
          <strong>{motionClipSources.length > 0 ? `${motionClipSources.length} imported` : "No clips"}</strong>
        </div>
        <div
          ref={timelineRef}
          className="animation-timeline animation-timeline--motion"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          aria-label="Motion clip track"
        >
          <div className="animation-timeline__ticks" />
          {motionClips.map((clip) => (
            <button
              key={clip.id}
              type="button"
              className="animation-clip-bar"
              style={{
                left: `${timePercent(clip.start, document.duration)}%`,
                width: `${Math.max(timePercent(clip.duration, document.duration), 1)}%`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                controller.setPlayhead(clip.start);
              }}
              title={clip.name}
            >
              <span>{clip.name}</span>
            </button>
          ))}
          <div
            ref={playheadRef}
            className="animation-timeline__playhead"
            style={{ left: `${playheadPercent}%` }}
          />
        </div>
      </div>

      <div className="animation-source-strip" aria-label="Imported motion clips">
        {controller.motionImportError ? (
          <span className="animation-empty animation-empty--error">
            {controller.motionImportError}
          </span>
        ) : motionClipSources.length === 0 ? (
          <span className="animation-empty">No imported motion clips on selected object</span>
        ) : (
          motionClipSources.map((source) => (
            <button
              key={source.id}
              type="button"
              className="animation-source-chip"
              onClick={() => controller.addMotionClip(source.id)}
              title={`${source.trackCount} tracks`}
            >
              <EditorIcon name="animation" size="compact" />
              <span>{source.name}</span>
              <em>{source.duration.toFixed(2)}s</em>
            </button>
          ))
        )}
      </div>

      <MotionClipEditor controller={controller} />
    </div>
  );
}
