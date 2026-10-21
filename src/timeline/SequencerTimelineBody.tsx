import { useCallback, useMemo, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { SceneObject } from "../types";
import { EditorCheckbox } from "../ui/controls";
import { EditorIcon } from "../ui/EditorIcon";
import {
  frameAtClientX,
  framePercent,
  labelForTrack,
  timelineTicks,
  type SelectedSequencerSection,
} from "./sequencer-presentation";
import type { PrimeTimelineDocument, SequencerTrack } from "./types";
import type { PrimeTimelineController } from "./usePrimeTimeline";

type SequencerTimelineBodyProps = Readonly<{
  controller: PrimeTimelineController;
  document: PrimeTimelineDocument;
  menu: ReactNode;
  objects: SceneObject[];
  playbackFrame: number;
  selected: SelectedSequencerSection | null;
  tracks: SequencerTrack[];
  onAddSection: (track: SequencerTrack) => void;
  onSelectSection: (trackId: string, sectionId: string) => void;
}>;

/** Ruler, playhead, and authored track lanes. */
export function SequencerTimelineBody({
  controller,
  document,
  menu,
  objects,
  playbackFrame,
  selected,
  tracks,
  onAddSection,
  onSelectSection,
}: SequencerTimelineBodyProps) {
  const ticks = useMemo(
    () => timelineTicks(document.minFrame, document.maxFrame),
    [document.maxFrame, document.minFrame],
  );
  const frameFromPointer = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return frameAtClientX(
      event.clientX,
      rect.left,
      rect.width,
      document.minFrame,
      document.maxFrame,
    );
  }, [document.maxFrame, document.minFrame]);
  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    controller.setFrame(frameFromPointer(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [controller, frameFromPointer]);
  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if ((event.buttons & 1) === 0) return;
    controller.setFrame(frameFromPointer(event));
  }, [controller, frameFromPointer]);

  return (
    <div className="prime-sequencer__body">
      {menu}
      <div className="prime-sequencer__ruler" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
        <span className="prime-sequencer__preview" />
        <span className="prime-sequencer__playhead prime-sequencer__playhead--ruler" />
        {ticks.map((frame) => (
          <span
            key={frame}
            className="prime-sequencer__tick"
            style={{
              "--tick-left": `${framePercent(frame, document.minFrame, document.maxFrame)}%`,
            } as CSSProperties}
          >
            {frame}
          </span>
        ))}
      </div>

      {tracks.length === 0 && (
        <div className="prime-sequencer__empty"><span>Select an object and add a track.</span></div>
      )}

      {tracks.map((track) => (
        <div className="prime-sequencer__track" key={track.id}>
          <div className="prime-sequencer__side prime-sequencer__track-head">
            <EditorCheckbox
              checked={track.enabled}
              aria-label={`${track.name} enabled`}
              onChange={(event) => controller.updateSequencerTrack(track.id, { enabled: event.currentTarget.checked })}
            />
            <span className={`prime-sequencer__kind prime-sequencer__kind--${track.kind}`}>
              {labelForTrack(track, objects)}
            </span>
            <input
              className="editor-input"
              type="text"
              value={track.name}
              aria-label={`${track.name} name`}
              onChange={(event) => controller.updateSequencerTrack(track.id, { name: event.currentTarget.value })}
            />
            <button type="button" className="icon-button compact" title="Add section" onClick={() => onAddSection(track)}>
              <EditorIcon name="add" size="compact" />
            </button>
            <button type="button" className="icon-button compact" title="Delete track" onClick={() => controller.removeSequencerTrack(track.id)}>
              <EditorIcon name="delete" size="compact" />
            </button>
          </div>
          <div className="prime-sequencer__lane" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
            <span className="prime-sequencer__preview" />
            <span className="prime-sequencer__playhead" />
            {track.sections.map((section) => {
              const left = framePercent(section.startFrame, document.minFrame, document.maxFrame);
              const right = framePercent(section.endFrame, document.minFrame, document.maxFrame);
              const active = track.enabled && section.enabled
                && playbackFrame >= section.startFrame && playbackFrame <= section.endFrame;
              const selectedSection = selected?.trackId === track.id && selected.sectionId === section.id;
              return (
                <button
                  type="button"
                  key={section.id}
                  className={[
                    "prime-sequencer__section",
                    active ? "active" : "",
                    selectedSection ? "selected" : "",
                    section.enabled ? "" : "muted",
                  ].filter(Boolean).join(" ")}
                  style={{
                    "--section-left": `${left}%`,
                    "--section-width": `${Math.max(1.8, right - left)}%`,
                    "--section-color": section.color ?? "#6f8997",
                  } as CSSProperties}
                  title={`${section.name} ${section.startFrame}-${section.endFrame}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSelectSection(track.id, section.id)}
                >
                  <span>{section.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
