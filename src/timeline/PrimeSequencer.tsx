import type { CSSProperties } from "react";
import type { SceneObject } from "../types";
import { SequencerHeader } from "./SequencerHeader";
import { SequencerSectionInspector } from "./SequencerSectionInspector";
import { SequencerTimelineBody } from "./SequencerTimelineBody";
import { SequencerTrackMenu } from "./SequencerTrackMenu";
import { framePercent } from "./sequencer-presentation";
import { useSequencerAuthoring } from "./useSequencerAuthoring";
import { useSequencerShortcuts } from "./useSequencerShortcuts";
import type { PrimeTimelineController } from "./usePrimeTimeline";
import { useTimelinePlaybackSnapshot } from "./useTimelinePlaybackSnapshot";

type PrimeSequencerProps = Readonly<{
  controller: PrimeTimelineController;
  objects: SceneObject[];
  activeObjectId: string;
  active: boolean;
}>;

/** Thin composition surface for timeline presentation and authoring controls. */
export function PrimeSequencer({ controller, objects, activeObjectId, active }: PrimeSequencerProps) {
  const { document } = controller;
  const playback = useTimelinePlaybackSnapshot(controller.playback, active);
  const authoring = useSequencerAuthoring(controller, objects, activeObjectId);
  useSequencerShortcuts(controller, active);

  const playhead = framePercent(playback.frame, document.minFrame, document.maxFrame);
  const previewStart = framePercent(document.previewStartFrame, document.minFrame, document.maxFrame);
  const previewEnd = framePercent(document.previewEndFrame, document.minFrame, document.maxFrame);
  const style = {
    "--sequencer-playhead": `${playhead}%`,
    "--sequencer-preview-start": `${previewStart}%`,
    "--sequencer-preview-width": `${Math.max(0.4, previewEnd - previewStart)}%`,
  } as CSSProperties;
  const trackMenu = (
    <SequencerTrackMenu
      menuRef={authoring.trackMenuRef}
      open={authoring.trackMenuOpen}
      selectedObject={authoring.selectedObject}
      onToggle={authoring.toggleTrackMenu}
      onAddObjectTrack={authoring.addObjectTrack}
    />
  );

  return (
    <div className="prime-sequencer" aria-label="Sequencer" style={style}>
      <SequencerHeader controller={controller} document={document} playback={playback} />
      <SequencerTimelineBody
        controller={controller}
        document={document}
        menu={trackMenu}
        objects={objects}
        playbackFrame={playback.frame}
        selected={authoring.selected}
        tracks={authoring.visibleTracks}
        onAddSection={authoring.addSection}
        onSelectSection={authoring.selectSection}
      />
      {authoring.selectedItem && (
        <SequencerSectionInspector
          document={document}
          item={authoring.selectedItem}
          targetName={authoring.selectedTargetName}
          onUpdate={authoring.updateSection}
          onDelete={() => {
            controller.removeSequencerSection(
              authoring.selectedItem!.track.id,
              authoring.selectedItem!.section.id,
            );
            authoring.clearSelection();
          }}
        />
      )}
    </div>
  );
}
