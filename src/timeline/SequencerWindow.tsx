import { BottomPanelWindow } from "../components/BottomPanelWindow";
import { PrimeSequencer } from "./PrimeSequencer";
import type { SceneObject } from "../types";
import type { PrimeTimelineController } from "./usePrimeTimeline";

type SequencerWindowProps = {
  controller: PrimeTimelineController;
  objects: SceneObject[];
  activeObjectId: string;
  active: boolean;
};

export function SequencerWindow({ controller, objects, activeObjectId, active }: SequencerWindowProps) {
  return (
    <BottomPanelWindow
      label="Sequencer"
      className="sequencer-window"
    >
      <PrimeSequencer
        controller={controller}
        objects={objects}
        activeObjectId={activeObjectId}
        active={active}
      />
    </BottomPanelWindow>
  );
}
