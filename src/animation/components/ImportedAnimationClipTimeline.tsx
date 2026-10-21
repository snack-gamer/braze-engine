import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ModelAnimationEventSettings } from "../../lib/model-import-settings";
import { clampTime, snapTime } from "../time";
import { useImportedClipPlayhead, orderedTimelineTimes } from "../hooks/useImportedClipPlayhead";
import { useImportedClipTimelineGutter } from "../hooks/useImportedClipTimelineGutter";
import { AnimationClipEventLine } from "./AnimationClipEventLine";
import { AnimationClipKeyRow } from "./AnimationClipKeyRow";
import { AnimationClipTimelineTransport, formatClipTime } from "./AnimationClipTimelineTransport";

export type ImportedAnimationClipKeyRow = Readonly<{
  id: string;
  targetLabel: string;
  propertyLabel: string;
  keyTimesSeconds: readonly number[];
  keyframeCount: number;
  truncated?: boolean;
}>;

type ImportedAnimationClipTimelineProps = Readonly<{
  clipName: string;
  durationSeconds: number;
  frameRate: number;
  looping: boolean;
  active: boolean;
  keyRows: readonly ImportedAnimationClipKeyRow[];
  keysLoading: boolean;
  keysError: string;
  events: readonly ModelAnimationEventSettings[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onAddEvent: (timeSeconds: number) => void;
  onMoveEvent: (eventId: string, timeSeconds: number) => void;
  onDeleteEvent: (eventId: string) => void;
  onPlaybackChange?: (playback: ImportedAnimationClipPlayback) => void;
}>;

export type ImportedAnimationClipPlayback = Readonly<{
  timeSeconds: number;
  playing: boolean;
  looping: boolean;
}>;

export function ImportedAnimationClipTimeline({
  clipName,
  durationSeconds,
  frameRate,
  looping,
  active,
  keyRows,
  keysLoading,
  keysError,
  events,
  selectedEventId,
  onSelectEvent,
  onAddEvent,
  onMoveEvent,
  onDeleteEvent,
  onPlaybackChange,
}: ImportedAnimationClipTimelineProps) {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRulerRef = useRef(false);
  const timelineGutter = useImportedClipTimelineGutter();
  const duration = Math.max(0.001, durationSeconds);
  const fps = Math.max(1, Math.round(frameRate));
  const allKeyTimes = useMemo(() => orderedTimelineTimes(
    keyRows.flatMap((row) => row.keyTimesSeconds),
    duration,
  ), [duration, keyRows]);
  const playhead = useImportedClipPlayhead({
    durationSeconds: duration,
    frameRate: fps,
    keyTimesSeconds: allKeyTimes,
    initialLooping: looping,
    active,
  });
  useEffect(() => {
    onPlaybackChange?.({
      timeSeconds: playhead.timeSeconds,
      playing: playhead.playing,
      looping: playhead.looping,
    });
  }, [onPlaybackChange, playhead.looping, playhead.playing, playhead.timeSeconds]);

  const timeAt = (clientX: number, element: HTMLElement | null) => {
    const bounds = element?.getBoundingClientRect();
    if (!bounds?.width) return 0;
    const raw = ((clientX - bounds.left) / bounds.width) * duration;
    return clampTime(snapTime(raw, fps), duration);
  };
  const scrubRuler = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    scrubbingRulerRef.current = true;
    playhead.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    playhead.setTime(timeAt(event.clientX, rulerRef.current));
  };
  const moveRulerScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbingRulerRef.current) playhead.setTime(timeAt(event.clientX, rulerRef.current));
  };
  const stopRulerScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRulerRef.current) return;
    scrubbingRulerRef.current = false;
    playhead.setTime(timeAt(event.clientX, rulerRef.current));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handlePlayheadKey = (event: React.KeyboardEvent) => {
    if (event.key === "Home") playhead.moveToStart();
    else if (event.key === "End") playhead.moveToEnd();
    else if (event.key === "ArrowLeft") playhead.setTime(playhead.timeSeconds - (1 / fps));
    else if (event.key === "ArrowRight") playhead.setTime(playhead.timeSeconds + (1 / fps));
    else if (event.key === " ") playhead.togglePlayback();
    else return;
    event.preventDefault();
  };

  return <div
    ref={timelineGutter.shellRef}
    className="animation-clip-timeline-shell"
    aria-label={`${clipName} imported animation timeline`}
  >
    <div className="animation-clip-timeline__header">
      <AnimationClipTimelineTransport
        timeSeconds={playhead.timeSeconds}
        durationSeconds={duration}
        frameRate={fps}
        playing={playhead.playing}
        looping={playhead.looping}
        onMoveToStart={playhead.moveToStart}
        onMoveToPreviousKey={playhead.moveToPreviousKey}
        onTogglePlayback={playhead.togglePlayback}
        onMoveToNextKey={playhead.moveToNextKey}
        onMoveToEnd={playhead.moveToEnd}
        onToggleLooping={playhead.toggleLooping}
        onSetTime={playhead.setTime}
      />
      <div
        ref={rulerRef}
        className="animation-clip-timeline__ruler"
        aria-label="Animation time ruler"
        onPointerDown={scrubRuler}
        onPointerMove={moveRulerScrub}
        onPointerUp={stopRulerScrub}
        onPointerCancel={stopRulerScrub}
      >
        {Array.from({ length: 11 }, (_, index) => <span
          key={index}
          style={{ left: `${index * 10}%` }}
        ><i />{formatClipTime((duration * index) / 10, fps)}</span>)}
        <div
          className="animation-clip-timeline__playhead"
          role="slider"
          tabIndex={0}
          aria-label="Animation playhead"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Number(playhead.timeSeconds.toFixed(4))}
          aria-valuetext={formatClipTime(playhead.timeSeconds, fps)}
          style={{ left: `${(playhead.timeSeconds / duration) * 100}%` }}
          onKeyDown={handlePlayheadKey}
        ><i /></div>
      </div>
    </div>

    <AnimationClipEventLine
      durationSeconds={duration}
      frameRate={fps}
      playheadSeconds={playhead.timeSeconds}
      events={events}
      selectedEventId={selectedEventId}
      onPause={playhead.pause}
      onSetPlayhead={playhead.setTime}
      onSelectEvent={onSelectEvent}
      onAddEvent={onAddEvent}
      onMoveEvent={onMoveEvent}
      onDeleteEvent={onDeleteEvent}
    />

    <div ref={timelineGutter.keyRowsRef} className="animation-clip-key-rows">
      <AnimationClipKeyRow
        targetLabel={clipName}
        propertyLabel={`${allKeyTimes.length} keyed ${allKeyTimes.length === 1 ? "time" : "times"}`}
        keyTimesSeconds={allKeyTimes}
        keyframeCount={allKeyTimes.length}
        durationSeconds={duration}
        playheadSeconds={playhead.timeSeconds}
        summary
        onScrubStart={playhead.pause}
        onSetPlayhead={playhead.setTime}
      />
      {keyRows.map((row) => <AnimationClipKeyRow
        key={row.id}
        {...row}
        durationSeconds={duration}
        playheadSeconds={playhead.timeSeconds}
        onScrubStart={playhead.pause}
        onSetPlayhead={playhead.setTime}
      />)}
      {keysLoading && <div className="animation-clip-keys-status" role="status">Loading imported keyframes…</div>}
      {!keysLoading && keysError && <div className="animation-clip-keys-status error" role="alert">{keysError}</div>}
      {!keysLoading && !keysError && keyRows.length === 0 && <div className="animation-clip-keys-status">This clip has no imported keyframe tracks.</div>}
    </div>

  </div>;
}
