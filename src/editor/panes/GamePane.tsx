import type { SceneAnimationController } from "../../animation/hooks/useSceneAnimation";
import type { CameraCoordinationController } from "../../camera/application/useCameraCoordination";
import { GameStage } from "../../components/game/GameStage";
import { GameViewToolbar } from "../../components/game/GameViewToolbar";
import type { useGameViewSettings } from "../../components/game/useGameViewSettings";
import { defaultCameraSettings } from "../../constants";
import type { PhysicsWorldController } from "../../physics/application/use-physics-world-controller";
import type { LiveTransformSubscription } from "../../scene/authoring/live-transform";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import type { EnvironmentSettings, Material, SceneObject } from "../../types";
import type { ScenePlaySessionController } from "../session/useScenePlaySaveSession";
import { useAnimatorDiagnosticReporter } from "../playback/AnimatorDiagnosticProvider";
import type { AnimatorPlaybackBinding } from "../../character/application/playback/animator-playback-binding";

type GamePaneToolbarProps = {
  settings: ReturnType<typeof useGameViewSettings>;
  cameras: CameraCoordinationController;
  playback: ScenePlaySessionController;
  setActiveCameraId: (id: string) => void;
};

export function GamePaneToolbar({ settings, cameras, playback, setActiveCameraId }: GamePaneToolbarProps) {
  return (
    <GameViewToolbar
      cameras={cameras.gameCameras}
      activeCameraId={cameras.gameActiveCamera?.id ?? ""}
      aspectPresets={settings.aspectPresets}
      activeAspectPresetId={settings.activeAspectPreset.id}
      lowResolution={settings.lowResolution}
      scale={settings.scale}
      showStats={settings.showStats}
      scenePlaybackMode={playback.mode}
      onActiveCameraChange={setActiveCameraId}
      onAspectPresetChange={settings.selectAspectPreset}
      onLowResolutionChange={settings.setLowResolution}
      onAddCustomResolution={settings.addCustomResolution}
      onScaleChange={settings.setScale}
      onToggleStats={settings.toggleStats}
    />
  );
}

type GamePaneProps = {
  active: boolean;
  loaded: boolean;
  objects: SceneObject[];
  authoredObjects: SceneObject[];
  materials: Material[];
  cameras: CameraCoordinationController;
  settings: ReturnType<typeof useGameViewSettings>;
  environment: EnvironmentSettings;
  playback: ScenePlaySessionController;
  physics: PhysicsWorldController;
  animation: SceneAnimationController;
  timeline: PrimeTimelineController;
  prefabModeActive: boolean;
  subscribeLiveObjectTransform?: LiveTransformSubscription;
  onAnimatorPlaybackBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
};

export function GamePane({
  active,
  loaded,
  objects,
  authoredObjects,
  materials,
  cameras,
  settings,
  environment,
  playback,
  physics,
  animation,
  timeline,
  prefabModeActive,
  subscribeLiveObjectTransform,
  onAnimatorPlaybackBindingChange,
}: GamePaneProps) {
  const reportAnimatorDiagnostics = useAnimatorDiagnosticReporter();
  return (
    <GameStage
      active={active}
      loaded={loaded}
      objects={objects}
      materials={materials}
      activeCameraId={cameras.gameActiveCamera?.id ?? ""}
      camera={cameras.gameCamera}
      cameraNear={cameras.gameActiveCamera?.camera?.near ?? defaultCameraSettings.near}
      cameraFar={cameras.gameActiveCamera?.camera?.far ?? defaultCameraSettings.far}
      cameraDepthOfField={cameras.gameDepthOfField}
      environment={environment}
      scale={settings.scale}
      showStats={settings.showStats}
      aspectPreset={settings.activeAspectPreset}
      lowResolution={settings.lowResolution}
      scenePlaybackMode={playback.mode}
      physicsStepToken={playback.physicsStepToken}
      physicsWorldSettings={physics.settings}
      animationDocument={!prefabModeActive ? animation.document : undefined}
      animationBaseObjects={!prefabModeActive ? authoredObjects : undefined}
      subscribeTimelineFrame={!prefabModeActive ? timeline.subscribeFrame : undefined}
      subscribeLiveObjectTransform={playback.mode === "edit" ? subscribeLiveObjectTransform : undefined}
      onAnimatorPlaybackBindingChange={onAnimatorPlaybackBindingChange}
      onAnimatorDiagnostics={reportAnimatorDiagnostics}
    />
  );
}
