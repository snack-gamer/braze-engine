import type { SceneAnimationController } from "../../animation/hooks/useSceneAnimation";
import {
  DeferredAnimationPanel,
  DeferredSequencerWindow,
} from "../../docking/DeferredPaneContent";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import type { SceneObject } from "../../types";
import type { LibraryAsset } from "../../lib/asset-api";
import type { AnimationClipEventInspectorPort } from "../../animation/application/animation-clip-event-inspector";
import type { ImportedClipPreviewChannel } from "../../animation/application/imported-clip-preview-channel";

export function AnimationPane({
  load,
  active,
  controller,
  assets,
  refreshAssets,
  eventInspector,
  importedClipPreview,
}: {
  load: boolean;
  active: boolean;
  controller: SceneAnimationController;
  assets: readonly LibraryAsset[];
  refreshAssets: () => void;
  eventInspector: AnimationClipEventInspectorPort;
  importedClipPreview: ImportedClipPreviewChannel;
}) {
  return <DeferredAnimationPanel
    load={load}
    active={active}
    controller={controller}
    assets={assets}
    refreshAssets={refreshAssets}
    eventInspector={eventInspector}
    importedClipPreview={importedClipPreview}
  />;
}

export function SequencerPane({
  load,
  active,
  controller,
  objects,
  activeObjectId,
}: {
  load: boolean;
  active: boolean;
  controller: PrimeTimelineController;
  objects: SceneObject[];
  activeObjectId: string;
}) {
  return (
    <DeferredSequencerWindow
      load={load}
      active={active}
      controller={controller}
      objects={objects}
      activeObjectId={activeObjectId}
    />
  );
}
