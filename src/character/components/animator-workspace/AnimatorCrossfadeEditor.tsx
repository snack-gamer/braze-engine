import { useRef, type CSSProperties } from "react";
import { InspectorNumberInput } from "../../../components/InspectorNumberInput";
import type { AnimatorTransition } from "../../domain/animator-controller";
import type { AnimatorTransitionPatch } from "../../application/animator-transition-authoring";
import {
  animatorClipTimeTicks,
  animatorCrossfadePlaybackPercent,
  animatorCrossfadeTimeline,
} from "./animator-crossfade-presentation";
import { useAnimatorCrossfadeDrag } from "./useAnimatorCrossfadeDrag";
import { inspectorSectionClass } from "./animator-inspector-classes";

type AnimatorCrossfadeEditorProps = Readonly<{
  transition: AnimatorTransition;
  sourceLabel: string;
  destinationLabel: string;
  sourceDurationSeconds?: number;
  playbackProgress?: number;
  onChange: (patch: AnimatorTransitionPatch) => void;
}>;

export function AnimatorCrossfadeEditor({
  transition,
  sourceLabel,
  destinationLabel,
  sourceDurationSeconds,
  playbackProgress,
  onChange,
}: AnimatorCrossfadeEditorProps) {
  const projectedTimeline = animatorCrossfadeTimeline(transition, sourceDurationSeconds);
  const viewportRef = useRef({
    transitionId: transition.id,
    editPointPercent: projectedTimeline.editPointPercent,
    endNormalized: projectedTimeline.timelineEndNormalized,
  });
  if (viewportRef.current.transitionId !== transition.id) {
    viewportRef.current = {
      transitionId: transition.id,
      editPointPercent: projectedTimeline.editPointPercent,
      endNormalized: projectedTimeline.timelineEndNormalized,
    };
  }
  const { previewRef, displayedTransition, dragHandlers } = useAnimatorCrossfadeDrag({
    transition,
    sourceDurationSeconds,
    timelineEndNormalized: viewportRef.current.endNormalized,
    onChange,
  });
  const timeline = animatorCrossfadeTimeline(
    displayedTransition,
    sourceDurationSeconds,
    viewportRef.current.endNormalized,
  );
  const style = {
    "--crossfade-start": `${timeline.fadeStartPercent}%`,
    "--crossfade-end": `${timeline.fadeEndPercent}%`,
    "--crossfade-edit-point": `${viewportRef.current.editPointPercent}%`,
    "--source-cycle": `${timeline.sourceCyclePercent}%`,
  } as CSSProperties;
  const durationSummary = displayedTransition.durationMode === "seconds"
    ? sourceDurationSeconds
      ? `${displayedTransition.duration.toFixed(2)} s · ${Math.round(timeline.durationNormalized * 100)}% source`
      : `${displayedTransition.duration.toFixed(2)} s`
    : `${Math.round(displayedTransition.duration * 100)}% source`;
  const playheadPercent = playbackProgress === undefined
    ? undefined
    : animatorCrossfadePlaybackPercent(timeline, playbackProgress);
  const playbackValue = playbackProgress === undefined
    ? undefined
    : Math.round(Math.min(1, Math.max(0, playbackProgress)) * 100);

  return (
    <section className={`${inspectorSectionClass} animator-crossfade-editor`}>
      <header><strong>Crossfade</strong><span>{durationSummary}</span></header>
      <div className="animator-crossfade-settings">
        <label className="animator-check"><input
          type="checkbox"
          checked={transition.hasExitTime}
          onChange={(event) => onChange({ hasExitTime: event.currentTarget.checked })}
        /> Has Exit Time</label>
        <label>Duration mode<select
          value={transition.durationMode}
          onChange={(event) => onChange({
            durationMode: event.currentTarget.value === "seconds" ? "seconds" : "normalized",
          })}
        >
          <option value="normalized">Normalized</option>
          <option value="seconds">Seconds</option>
        </select></label>
      </div>
      <div
        ref={previewRef}
        className="animator-crossfade-preview"
        style={style}
        role="group"
        aria-label={`${sourceLabel} crossfades to ${destinationLabel}; ${durationSummary}`}
      >
        {[25, 50, 75].map((position) => (
          <span key={position} className="animator-crossfade-preview__grid" style={{ left: `${position}%` }} />
        ))}
        <span className="animator-crossfade-preview__ruler-start">0</span>
        <span className="animator-crossfade-preview__ruler-end">
          {timeline.timelineEndNormalized.toFixed(2)}×
        </span>
        <span className="animator-crossfade-preview__cycle" title="End of the first source cycle" />
        {playheadPercent !== undefined && <span
          className="animator-crossfade-preview__playhead"
          style={{ left: `${playheadPercent}%` }}
          role="progressbar"
          aria-label="Crossfade playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={playbackValue}
        />}
        <div
          className="animator-crossfade-preview__clip is-source"
        ><span>{sourceLabel}</span><ClipTimeStrip offsetNormalized={0} /></div>
        <div
          className="animator-crossfade-preview__clip is-destination"
        ><span>{destinationLabel}</span><ClipTimeStrip
          offsetNormalized={displayedTransition.offsetNormalized}
        /></div>
        <div
          className="animator-crossfade-preview__overlay"
        >
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            <path className="is-source" d="M 0 2 C 35 2 65 30 100 30" />
            <path className="is-destination" d="M 0 30 C 35 30 65 2 100 2" />
          </svg>
          <button
            type="button"
            className="animator-crossfade-preview__handle is-in"
            disabled={!transition.hasExitTime}
            aria-label="Resize crossfade in point"
            title={transition.hasExitTime ? "Drag to adjust the crossfade in point" : "Enable Has Exit Time to adjust the in point"}
            {...dragHandlers("source")}
          />
          <button
            type="button"
            className="animator-crossfade-preview__move"
            disabled={!transition.hasExitTime}
            aria-label="Move crossfade"
            title={transition.hasExitTime ? "Drag to move the crossfade" : "Enable Has Exit Time to move the crossfade"}
            {...dragHandlers("crossfade")}
          />
          <button
            type="button"
            className="animator-crossfade-preview__handle is-out"
            aria-label="Resize crossfade out point"
            title="Drag to adjust the crossfade out point"
            {...dragHandlers("destination")}
          />
        </div>
      </div>
      <p className="animator-crossfade-help">Drag either gizmo edge to resize the blend. Drag its center to move it.</p>
      <div
        className="animator-crossfade-values"
        data-has-exit-time={transition.hasExitTime || undefined}
      >
        {transition.hasExitTime && <label><span>Exit time</span><InspectorNumberInput
          value={transition.exitTimeNormalized}
          min={0}
          step={0.01}
          decimals={2}
          ariaLabel="Crossfade exit time"
          onChange={(exitTimeNormalized) => onChange({ exitTimeNormalized })}
        /></label>}
        <label><span>Destination offset</span><InspectorNumberInput
          value={transition.offsetNormalized}
          min={0}
          step={0.01}
          decimals={2}
          ariaLabel="Crossfade destination offset"
          onChange={(offsetNormalized) => onChange({ offsetNormalized })}
        /></label>
        <label><span>Duration</span><InspectorNumberInput
          value={transition.duration}
          min={0}
          step={0.01}
          decimals={2}
          unit={transition.durationMode === "seconds" ? "s" : undefined}
          ariaLabel="Crossfade duration"
          onChange={(duration) => onChange({ duration })}
        /></label>
      </div>
    </section>
  );
}

function ClipTimeStrip({ offsetNormalized }: Readonly<{ offsetNormalized: number }>) {
  const offset = Number.isFinite(offsetNormalized) ? Math.max(0, offsetNormalized) : 0;
  return <span className="animator-crossfade-preview__time-strip" aria-hidden="true">
    <small>{offset.toFixed(2)}×</small>
    {animatorClipTimeTicks(offset).map((tick, index) => <i
      key={`${tick.positionPercent}:${index}`}
      className={tick.cycleBoundary ? "is-cycle" : undefined}
      style={{ left: `${tick.positionPercent}%` }}
    >{tick.label && <b>{tick.label}</b>}</i>)}
  </span>;
}
