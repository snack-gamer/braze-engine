import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ThreeScene } from "../../ThreeScene";
import type { AnimationDocument } from "../../animation/types";
import type { PrimeTimelineSample } from "../../timeline/types";
import type {
  CameraState,
  DepthOfFieldComponent,
  EnvironmentSettings,
  Material,
  PhysicsWorldSettings,
  SceneObject,
  ScenePlaybackMode,
} from "../../types";
import {
  gameViewAspectRatio,
  gameViewOutputSize,
  type GameViewAspectPreset,
} from "./game-view-aspect";
import type { LiveTransformSubscription } from "../../scene/authoring/live-transform";
import type { AnimatorPlaybackBinding } from "../../character/application/playback/animator-playback-binding";
import type { CharacterRuntimeDiagnostic } from "../../character/runtime/diagnostics";
import { isGameInputUiTarget } from "../../input/adapters/browser-game-input";

type GameStageProps = {
  active: boolean;
  loaded: boolean;
  objects: SceneObject[];
  materials: Material[];
  activeCameraId: string;
  camera: CameraState;
  cameraNear: number;
  cameraFar: number;
  cameraDepthOfField: DepthOfFieldComponent | null;
  environment: EnvironmentSettings;
  scale: number;
  showStats: boolean;
  aspectPreset: GameViewAspectPreset;
  lowResolution: boolean;
  scenePlaybackMode: ScenePlaybackMode;
  physicsStepToken: number;
  physicsWorldSettings: PhysicsWorldSettings;
  animationDocument?: AnimationDocument;
  animationBaseObjects?: SceneObject[];
  subscribeTimelineFrame?: (listener: (sample: PrimeTimelineSample) => void) => () => void;
  subscribeLiveObjectTransform?: LiveTransformSubscription;
  onAnimatorPlaybackBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
  onAnimatorDiagnostics?: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void;
};

const noop = () => undefined;

/** Final active-camera output. This surface intentionally has no scene
 * selection, orbit controls, grids, labels, or authoring gizmos. Pointer and
 * keyboard focus stay on the rendered canvas for runtime UI/gameplay input. */
export function GameStage({
  active,
  loaded,
  objects,
  materials,
  activeCameraId,
  camera,
  cameraNear,
  cameraFar,
  cameraDepthOfField,
  environment,
  scale,
  showStats,
  aspectPreset,
  lowResolution,
  scenePlaybackMode,
  physicsStepToken,
  physicsWorldSettings,
  animationDocument,
  animationBaseObjects,
  subscribeTimelineFrame,
  subscribeLiveObjectTransform,
  onAnimatorPlaybackBindingChange,
  onAnimatorDiagnostics,
}: GameStageProps) {
  const gameViewRef = useRef<HTMLElement | null>(null);
  const focusInputSurface = (event: ReactPointerEvent<HTMLElement>) => {
    if (isGameInputUiTarget(event.target)) return;
    event.currentTarget.focus({ preventScroll: true });
  };
  const aspectRatio = gameViewAspectRatio(aspectPreset);
  const renderSize = gameViewOutputSize(aspectPreset, lowResolution);
  const frameStyle = {
    "--game-view-scale": scale,
    "--game-view-aspect": aspectRatio ?? 1,
  } as CSSProperties;

  return (
    <section
      ref={gameViewRef}
      className={`game-view game-view--${scenePlaybackMode}`}
      aria-label={`Game view — ${scenePlaybackMode}`}
      role="application"
      tabIndex={0}
      data-playback-mode={scenePlaybackMode}
      data-runtime-input-surface="true"
      onPointerDown={focusInputSurface}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className={aspectRatio ? "game-view__frame is-constrained" : "game-view__frame is-free"}
        style={frameStyle}
        data-aspect-preset={aspectPreset.id}
        data-output-size={renderSize ? `${renderSize.width}x${renderSize.height}` : "pane"}
      >
        {active && loaded && activeCameraId ? (
          <ThreeScene
            viewportMode="game"
            showStats={showStats}
            viewportHudHostRef={gameViewRef}
            renderSize={renderSize}
            lowResolution={lowResolution}
            objects={objects}
            materials={materials}
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
            scenePlaybackMode={scenePlaybackMode}
            physicsStepToken={physicsStepToken}
            physicsWorldSettings={physicsWorldSettings}
            editingCollider={null}
            environment={environment}
            activeCameraId={activeCameraId}
            cameraTransform={camera}
            cameraNear={cameraNear}
            cameraFar={cameraFar}
            cameraDepthOfField={cameraDepthOfField}
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
            animationDocument={animationDocument}
            animationBaseObjects={animationBaseObjects}
            subscribeTimelineFrame={subscribeTimelineFrame}
            subscribeLiveObjectTransform={subscribeLiveObjectTransform}
            onAnimatorPlaybackBindingChange={onAnimatorPlaybackBindingChange}
            onAnimatorDiagnostics={onAnimatorDiagnostics}
          />
        ) : active && !loaded ? (
          <div className="game-view__empty" role="status">Loading scene</div>
        ) : active ? (
          <div className="game-view__empty" role="status">
            <strong>No active camera</strong>
            <span>Create or activate a Camera in the Hierarchy to render the Game view.</span>
          </div>
        ) : null}
      </div>
      <span className={`game-view__mode-badge is-${scenePlaybackMode}`} aria-hidden="true">
        {scenePlaybackMode.toUpperCase()}
      </span>
      <div className="game-view__focus-hint" aria-hidden="true">Click to focus game input</div>
    </section>
  );
}
