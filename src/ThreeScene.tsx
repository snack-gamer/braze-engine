import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  CameraState,
  PhysicsWorldSettings,
  SceneObject,
  ScenePlaybackMode,
} from "./types";
import type { Runtime } from "./three/runtime";
import { setupViewport } from "./three/setup-viewport";
import { useCameraSync } from "./three/hooks/use-camera-sync";
import { useEditorGrid } from "./three/hooks/use-editor-grid";
import { useEnvironment } from "./three/hooks/use-environment";
import { useDirectionalLight } from "./three/hooks/use-directional-light";
import { useAnimationFrameSync } from "./three/hooks/use-animation-frame-sync";
import { useReconcile } from "./three/hooks/use-reconcile";
import type { AnimationDocument } from "./animation/types";
import { clonerHasAnimatedEffectors } from "./three/cloner";
import { createRuntimeModifierPlan } from "./three/modifiers/runtime";
import { useLiveTransformSync } from "./three/hooks/use-live-transform-sync";
import {
  rendererInitializationDiagnostic,
  type RendererFailureDiagnostic,
} from "./three/device-lifecycle";
import { useAnimatorPlayback } from "./character/adapters/three/useAnimatorPlayback";
import { useImportedClipViewportPreview } from "./character/adapters/three/useImportedClipViewportPreview";
import type { ThreeSceneProps } from "./three/three-scene-props";
import { useRenderSession } from "./rendering/application/RenderSessionProvider";
import { useGameWorldView } from "./gameplay/adapters/useGameWorldView";
import { GameFailure } from "./gameplay/components/GameFailure";
import { usePlaySceneObjects } from "./gameplay/adapters/usePlaySceneObjects";

export type { ObjectTransformPatch } from "./three/runtime";

const noopPreviewTransform = () => undefined;

export function ThreeScene({
  viewportMode = "scene",
  showStats = false,
  viewportHudHostRef,
  renderSize = null,
  lowResolution = false,
  objects: authoredObjects,
  materials,
  activeObjectId,
  transformMode,
  showTransformControls,
  showEditorOverlays,
  showObjectLabels,
  showCameraGizmos,
  showGrid,
  transformSpace,
  transformSnapping,
  translationSnap,
  rotationSnapDegrees,
  scaleSnap,
  transformGizmoSize,
  focusSelectionToken,
  animationPreviewMode = false,
  scenePlaybackMode,
  physicsStepToken,
  physicsWorldSettings,
  editingCollider,
  environment,
  activeCameraId,
  cameraPreviewAspect = null,
  cameraTransform,
  cameraNear,
  cameraFar,
  cameraDepthOfField,
  gridOpacity,
  gridColor,
  gridHorizon,
  onSelectObject,
  onCameraChange,
  onTransformObject,
  onPreviewTransformObject = noopPreviewTransform,
  onUpdateModifierPin,
  onUpdateCollider,
  selectedModifierPin,
  onSelectModifierPin,
  onRenderStatusChange,
  onViewportFrameRate,
  animationDocument,
  animationBaseObjects,
  subscribeTimelineFrame,
  onAssetAnimationsDiscovered,
  subscribeLiveObjectTransform,
  onAnimatorPlaybackBindingChange,
  subscribeImportedClipPreview,
  onAnimatorDiagnostics,
}: ThreeSceneProps) {
  const renderSession = useRenderSession();
  const objects = usePlaySceneObjects(renderSession, authoredObjects, scenePlaybackMode);
  const physicsObjectsRef = useRef(authoredObjects);
  physicsObjectsRef.current = authoredObjects;
  const renderSurfaceName = `${viewportMode}-${useId()}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewportGeneration, setViewportGeneration] = useState(0);
  const [rendererFailure, setRendererFailure] = useState<RendererFailureDiagnostic | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const runtimeRef = useRef<Runtime | null>(null);
  const callbacksRef = useRef({
    onSelectObject,
    onCameraChange,
    onTransformObject,
    onPreviewTransformObject,
    onUpdateModifierPin,
    onUpdateCollider,
    onSelectModifierPin,
    onRenderStatusChange,
    onViewportFrameRate,
    onAssetAnimationsDiscovered,
  });
  callbacksRef.current = {
    onSelectObject,
    onCameraChange,
    onTransformObject,
    onPreviewTransformObject,
    onUpdateModifierPin,
    onUpdateCollider,
    onSelectModifierPin,
    onRenderStatusChange,
    onViewportFrameRate,
    onAssetAnimationsDiscovered,
  };
  const lastEmittedCameraRef = useRef<CameraState | null>(null);
  const objectsRef = useRef<SceneObject[]>(objects);
  objectsRef.current = objects;
  const hasAnimatedCloners = useMemo(() => clonerHasAnimatedEffectors(objects), [objects]);
  const hasAnimatedClonersRef = useRef(hasAnimatedCloners);
  hasAnimatedClonersRef.current = hasAnimatedCloners;
  const modifierPlan = useMemo(() => createRuntimeModifierPlan(objects), [objects]);
  const modifierPlanRef = useRef(modifierPlan);
  modifierPlanRef.current = modifierPlan;
  const scenePlaybackModeRef = useRef<ScenePlaybackMode>(scenePlaybackMode);
  scenePlaybackModeRef.current = scenePlaybackMode;
  const physicsStepTokenRef = useRef(physicsStepToken);
  physicsStepTokenRef.current = physicsStepToken;
  const physicsWorldSettingsRef = useRef<PhysicsWorldSettings>(physicsWorldSettings);
  physicsWorldSettingsRef.current = physicsWorldSettings;
  const showStatsRef = useRef(showStats);
  showStatsRef.current = showStats;
  const renderSizeRef = useRef(renderSize);
  renderSizeRef.current = renderSize;
  const lowResolutionRef = useRef(lowResolution);
  lowResolutionRef.current = lowResolution;
  const cameraPreviewAspectRef = useRef(cameraPreviewAspect);
  cameraPreviewAspectRef.current = cameraPreviewAspect;
  // Live mirror of the selected object id for the F-to-focus key handler
  // (registered once in setupViewport, so a closed-over `activeObjectId`
  // would be stale on every press after the first).
  const activeObjectIdRef = useRef(activeObjectId);
  activeObjectIdRef.current = activeObjectId;
  // Timeline playhead is delivered through subscribeTimelineFrame. Keep the
  // document used by reconciliation structurally stable so scrubbing/playing
  // does not trigger a full world reconcile on every frame.
  const animationStructureDocument = useMemo<AnimationDocument | undefined>(() => (
    animationDocument
      ? { ...animationDocument, playhead: 0 }
      : undefined
  ), [
    animationDocument?.duration,
    animationDocument?.fps,
    animationDocument?.loop,
    animationDocument?.motionSources,
    animationDocument?.tracks,
  ]);

  const handleRendererFailure = useCallback((diagnostic: RendererFailureDiagnostic) => {
    setRendererFailure(diagnostic);
    console.error(`[renderer:${diagnostic.kind}] ${diagnostic.message}`, { reason: diagnostic.reason });
    // Recreate once for a transient adapter reset. A permanent capability
    // failure remains visible instead of entering an unbounded remount loop.
    if (recoveryAttemptsRef.current >= 1) return;
    recoveryAttemptsRef.current += 1;
    setViewportGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      return setupViewport({
        host,
        renderSession,
        renderSurfaceName,
        viewportHudHost: viewportHudHostRef?.current ?? undefined,
        initial: {
          viewportMode,
          renderSize,
          lowResolution,
          transformMode,
          showGrid,
          animationPreviewMode,
          environment,
          gridOpacity,
          gridColor,
          gridHorizon,
        },
        runtimeRef,
        objectsRef,
        physicsObjectsRef,
        hasAnimatedClonersRef,
        modifierPlanRef,
        scenePlaybackModeRef,
        physicsStepTokenRef,
        physicsWorldSettingsRef,
        showStatsRef,
        renderSizeRef,
        lowResolutionRef,
        cameraPreviewAspectRef,
        callbacksRef,
        activeObjectIdRef,
        lastEmittedCameraRef,
        onRendererReady: () => setRendererFailure(null),
      });
    } catch (error) {
      handleRendererFailure(rendererInitializationDiagnostic(error));
      return undefined;
    }
    // setupViewport reads `initial` only at mount. Live updates flow through
    // the prop-driven hooks below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderSession, renderSurfaceName, viewportGeneration]);

  useReconcile({
    runtimeRef,
    objects,
    activeObjectId,
    activeCameraId,
    cameraPreviewAspect,
    transformMode,
    showTransformControls,
    showEditorOverlays,
    showObjectLabels,
    showCameraGizmos,
    transformSpace,
    transformSnapping,
    translationSnap,
    rotationSnapDegrees,
    scaleSnap,
    transformGizmoSize,
    scenePlaybackMode,
    animationPreviewMode,
    selectedModifierPin,
    editingCollider,
    materials,
    animationDocument: scenePlaybackMode === "edit" ? animationStructureDocument : undefined,
    onAssetAnimationsDiscovered,
  });

  useCameraSync({
    runtimeRef,
    cameraTransform,
    cameraNear,
    cameraFar,
    cameraDepthOfField,
    lastEmittedRef: lastEmittedCameraRef,
  });

  useLiveTransformSync({
    runtimeRef,
    objects,
    activeCameraId,
    subscribe: subscribeLiveObjectTransform,
  });

  useEditorGrid({ runtimeRef, showGrid, gridOpacity, gridColor, gridHorizon });

  useEffect(() => {
    runtimeRef.current?.resizeViewport();
  }, [cameraPreviewAspect, lowResolution, renderSize?.height, renderSize?.width]);

  useEffect(() => {
    runtimeRef.current?.requestFrame?.();
  }, [showStats]);

  useEffect(() => {
    if (focusSelectionToken > 0) runtimeRef.current?.focusSelection();
  }, [focusSelectionToken]);

  useEnvironment({ runtimeRef, environment });

  useDirectionalLight({ runtimeRef, objects, environment });

  useAnimationFrameSync({
    runtimeRef,
    objects: animationBaseObjects ?? objects,
    scenePlaybackMode,
    animationDocument: animationStructureDocument,
    subscribeTimelineFrame,
  });

  useAnimatorPlayback({
    runtimeRef,
    viewportGeneration,
    onBindingChange: onAnimatorPlaybackBindingChange,
    onDiagnostics: onAnimatorDiagnostics,
  });

  const gameplayFailure = useGameWorldView({
    viewportMode, runtimeRef, hostRef, renderSession, viewportGeneration,
  });

  const importedClipPreview = useImportedClipViewportPreview({
    runtimeRef,
    objects,
    activeObjectId,
    scenePlaybackMode,
    viewportGeneration,
    subscribe: subscribeImportedClipPreview,
  });

  return (
    <div
      ref={hostRef}
      className={`three-host three-host--${viewportMode}`}
      aria-label={viewportMode === "game" ? "Game render viewport" : "3D scene viewport"}
      data-imported-clip-preview={importedClipPreview.state}
      data-imported-clip-preview-target={importedClipPreview.targetObjectId}
    >
      <GameFailure diagnostic={gameplayFailure} />
      {rendererFailure && recoveryAttemptsRef.current >= 1 ? (
        <div className="three-host__fatal" role="alert">
          <strong>Renderer unavailable</strong>
          <span>{rendererFailure.message}</span>
        </div>
      ) : null}
    </div>
  );
}
