import { useMemo } from "react";
import { ThreeScene } from "../../ThreeScene";
import { defaultCameraSettings } from "../../constants";
import { resolveEffectiveDepthOfField } from "../../lib/depth-of-field";
import { cameraStateForObject } from "../../lib/hierarchy";
import type { DecodedPlayerPackage } from "../serialization/player-package-codec";
import type { PlayerTimelinePlayback } from "../runtime/player-timeline-playback";
import { useGameplayPlaybackWorld } from "../../gameplay/adapters/useGameplayPlaybackWorld";

type PlayerViewportProps = Readonly<{
  playerPackage: DecodedPlayerPackage;
  timeline: PlayerTimelinePlayback | null;
}>;

const noop = () => undefined;

/** Full-window active-camera output with every editor interaction disabled. */
export function PlayerViewport({ playerPackage, timeline }: PlayerViewportProps) {
  const scene = playerPackage.scene;
  useGameplayPlaybackWorld({ objects: scene.objects, worldSettings: scene.physicsWorldSettings, mode: "playing", stepToken: 0 });
  const cameraObject = useMemo(() => scene.objects.find((object) => (
    object.id === scene.activeCameraId && object.primitive === "camera"
  )) ?? null, [scene.activeCameraId, scene.objects]);
  const camera = useMemo(() => (
    cameraObject ? cameraStateForObject(scene.objects, cameraObject) ?? scene.camera : scene.camera
  ), [cameraObject, scene.camera, scene.objects]);
  const depthOfField = useMemo(() => resolveEffectiveDepthOfField(
    cameraObject?.depthOfField ?? null,
    camera,
    scene.objects,
  ), [camera, cameraObject?.depthOfField, scene.objects]);

  if (!cameraObject || !scene.activeCameraId) {
    return (
      <main className="player-message player-message--fatal" role="alert">
        <strong>No active camera</strong>
        <span>The exported scene needs an active Camera component.</span>
      </main>
    );
  }

  return (
    <ThreeScene
      viewportMode="game"
      showStats={false}
      renderSize={null}
      lowResolution={false}
      objects={scene.objects}
      materials={playerPackage.materials}
      activeObjectId=""
      transformMode="translate"
      showTransformControls={false}
      showEditorOverlays={false}
      showObjectLabels={false}
      showCameraGizmos={false}
      showGrid={false}
      transformSpace="world"
      transformSnapping={false}
      translationSnap={0.5}
      rotationSnapDegrees={15}
      scaleSnap={0.1}
      transformGizmoSize={0.7}
      focusSelectionToken={0}
      animationPreviewMode={false}
      scenePlaybackMode="playing"
      physicsStepToken={0}
      physicsWorldSettings={scene.physicsWorldSettings}
      editingCollider={null}
      environment={scene.environment}
      activeCameraId={scene.activeCameraId}
      cameraTransform={camera}
      cameraNear={cameraObject.camera?.near ?? defaultCameraSettings.near}
      cameraFar={cameraObject.camera?.far ?? defaultCameraSettings.far}
      cameraDepthOfField={depthOfField}
      gridOpacity={0}
      gridColor="#000000"
      gridHorizon={1}
      onSelectObject={noop}
      onCameraChange={noop}
      onTransformObject={noop}
      onUpdateModifierPin={noop}
      onUpdateCollider={noop}
      selectedModifierPin={null}
      onSelectModifierPin={noop}
      animationDocument={scene.animation}
      animationBaseObjects={scene.objects}
      subscribeTimelineFrame={timeline?.subscribe}
    />
  );
}
