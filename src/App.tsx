import { useEditorAutomation } from "./automation/adapters/useEditorAutomation";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSceneAnimation } from "./animation/hooks/useSceneAnimation";
import { createImportedClipPreviewChannel } from "./animation/application/imported-clip-preview-channel";
import { useSceneAssetIntegration } from "./assets/application/useSceneAssetIntegration";
import { useCameraCoordination } from "./camera/application/useCameraCoordination";
import { useAnimatorWorkspaceSession, type AnimatorWorkspaceTarget } from "./character/application/useAnimatorWorkspaceSession";
import { LazyAnimatorDockPane } from "./character/components/animator-workspace/LazyAnimatorDockPane";
import { useAnimatorPlaybackBindingSelection } from "./character/application/useAnimatorPlaybackBindingSelection";
import { gameViewAspectRatio } from "./components/game/game-view-aspect";
import { useGameViewSettings } from "./components/game/useGameViewSettings";
import { useSceneAuthoringState } from "./scene/hooks/useSceneAuthoringState";
import { useSceneActivation } from "./scene/hooks/useSceneActivation";
import { useEditorDockController } from "./docking/EditorDockWorkspace";
import { GamePane, GamePaneToolbar } from "./editor/panes/GamePane";
import { HierarchyPane } from "./editor/panes/HierarchyPane";
import { InspectorPane } from "./editor/panes/InspectorPane";
import { ProjectPane } from "./editor/panes/ProjectPane";
import { ScenePane, ScenePaneToolbar } from "./editor/panes/ScenePane";
import { AnimationPane, SequencerPane } from "./editor/panes/WorkflowPanes";
import { useEditorSelection } from "./editor/selection/useEditorSelection";
import { useOpenProjectPaneOnAssetFocus } from "./editor/selection/useOpenProjectPaneOnAssetFocus";
import { useOpenAnimationPaneOnClipEdit } from "./editor/selection/useOpenAnimationPaneOnClipEdit";
import { EditorApplicationShell } from "./editor/shell/EditorApplicationShell";
import { EditorTopBar } from "./editor/shell/EditorTopBar";
import { isDockPaneActive } from "./editor/shell/dock-pane-activity";
import { useScenePlaySession, useSceneSaveShortcut } from "./editor/session/useScenePlaySaveSession";
import { useSceneStartupNormalization } from "./editor/session/useSceneStartupNormalization";
import { useAssetLibrary } from "./hooks/useAssetLibrary";
import { useEditorKeyboardShortcuts } from "./hooks/useEditorKeyboardShortcuts";
import { useEditorPrefs } from "./hooks/useEditorPrefs";
import { useHdriLibrary } from "./hooks/useHdriLibrary";
import { useMaterials } from "./hooks/useMaterials";
import { useSceneSync } from "./hooks/useSceneSync";
import { useSceneMaterialIntegration } from "./materials/application/useSceneMaterialIntegration";
import { usePhysicsWorldController } from "./physics/application/use-physics-world-controller";
import { usePrefabEditorSession } from "./prefabs/application/usePrefabEditorSession";
import { createLiveTransformChannel } from "./scene/authoring/live-transform";
import { useSceneObjectCommands } from "./scene/hooks/useSceneObjectCommands";
import { timelineFromAnimationDocument } from "./timeline/document";
import { usePrimeTimeline } from "./timeline/usePrimeTimeline";
import type { TransformMode } from "./types";
import { useAssetFocusReconciliation } from "./editor/selection/useAssetFocusReconciliation";

export function App() {
  const dockController = useEditorDockController();
  useOpenProjectPaneOnAssetFocus(dockController.openPane);
  useOpenAnimationPaneOnClipEdit(dockController.openPane);
  const animatorWorkspace = useAnimatorWorkspaceSession();
  const animatorPlayback = useAnimatorPlaybackBindingSelection();
  const openAnimatorWorkspace = useCallback((target: AnimatorWorkspaceTarget) => {
    animatorWorkspace.open(target);
    dockController.openPane("animator");
  }, [animatorWorkspace.open, dockController.openPane]);
  const liveTransforms = useMemo(() => createLiveTransformChannel(), []);
  const importedClipPreview = useMemo(() => createImportedClipPreviewChannel(), []);
  const { scope, hydrate, objectsHistory, activeObjectId, setActiveObjectId, activeCameraId, setActiveCameraId,
    camera, setCamera, environment, setEnvironment } = useSceneAuthoringState();
  const objects = objectsHistory.state;
  const setObjects = objectsHistory.set;
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const editorPrefs = useEditorPrefs();
  const gameViewSettings = useGameViewSettings();
  const assetLibrary = useAssetLibrary();
  const hdriLibrary = useHdriLibrary();
  const materialStore = useMaterials();
  const physicsWorld = usePhysicsWorldController();
  const timeline = usePrimeTimeline();
  const selection = useEditorSelection({
    activeObjectId,
    setActiveObjectId,
    materials: materialStore.materials,
  });
  useAssetFocusReconciliation({
    assets: assetLibrary.assets,
    focused: selection.focusedAsset,
    ready: assetLibrary.ready,
    setFocused: selection.setFocusedAsset,
  });
  const preparePrefabEditor = useCallback(() => {
    selection.setFocusedMaterialId(null);
    selection.setFocusedAsset(null);
    selection.setEditingCollider(null);
    selection.setSelectedModifierPin(null);
    selection.setInspectorTarget("object");
  }, [
    selection.setEditingCollider,
    selection.setFocusedAsset,
    selection.setFocusedMaterialId,
    selection.setInspectorTarget,
    selection.setSelectedModifierPin,
  ]);
  const prefab = usePrefabEditorSession({
    camera,
    activeSceneObjectId: activeObjectId,
    setSceneObjects: setObjects,
    setActiveSceneObjectId: setActiveObjectId,
    refreshAssets: assetLibrary.refresh,
    onEntered: preparePrefabEditor,
    onSelectedObject: () => selection.setInspectorTarget("object"),
    setSelectedModifierPin: selection.setSelectedModifierPin,
  });
  const prefabModeActive = Boolean(prefab.state);
  const selectSceneObject = useCallback((id: string) => {
    if (!scope.current()) return;
    prefab.close();
    selection.selectSceneObject(id);
  }, [scope, prefab.close, selection.selectSceneObject]);
  const sceneAnimation = useSceneAnimation({
    objects,
    activeObjectId,
    enabled: !prefabModeActive,
    timeline,
  });
  const activeObject = objects.find((object) => object.id === activeObjectId) ?? objects[0] ?? null;
  const activeTransformParentId = activeObject?.primitive === "transform" || activeObject?.primitive === "cloner"
    ? activeObject.id
    : undefined;
  const sceneCommands = useSceneObjectCommands({
    objects,
    activeObjectId,
    activeTransformParentId,
    camera,
    setObjects,
    selectObject: selectSceneObject,
    setActiveObjectId,
    setSelectedModifierPin: selection.setSelectedModifierPin,
    recordTransformEdit: sceneAnimation.recordTransformEdit,
  });
  const materialIntegration = useSceneMaterialIntegration({
    materials: materialStore.materials,
    setSceneObjects: setObjects,
    prefabModeActive,
    mutatePrefabObjects: prefab.mutateObjects,
  });
  const assetIntegration = useSceneAssetIntegration({
    assetLibrary,
    materials: materialStore.materials,
    createMaterials: materialStore.createMany,
    sceneObjects: objects,
    setSceneObjects: setObjects,
    activeTransformParentId,
    selectSceneObject,
    focusedAsset: selection.focusedAsset,
    setFocusedAsset: selection.setFocusedAsset,
    activeHdriUrl: environment.hdriUrl ?? undefined,
    prefab,
  });
  const sceneLoadedRef = useRef(false);
  const isSceneLoaded = useCallback(() => sceneLoadedRef.current, []);
  const playback = useScenePlaySession({
    timeline, objects, importedAssets: assetLibrary.assets, assetsLoaded: assetLibrary.loaded,
    prefabModeActive,
    isSceneLoaded,
    activeObjectId,
    setActiveObjectId,
    objectHistory: objectsHistory,
    physicsWorld,
    dockController,
  });
  const sceneSync = useSceneSync({
    objects,
    camera,
    activeObjectId,
    activeCameraId,
    environment,
    physicsWorldSettings: physicsWorld.settings,
    timeline: timeline.serializedDocument,
    animation: sceneAnimation.serializedDocument,
    playModeActive: playback.active || timeline.playing,
    onLoaded: (next) => {
      hydrate(next);
      if (next.physicsWorldSettings) physicsWorld.load(next.physicsWorldSettings);
      timeline.loadDocument(next.timeline ?? timelineFromAnimationDocument(next.animation));
      sceneAnimation.loadDocument(next.animation);
    },
  });
  useSceneActivation({ sceneSync, selection, animatorWorkspace, importedClipPreview });
  sceneLoadedRef.current = sceneSync.loaded;
  useEditorAutomation({ objectsHistory, sceneSync, playback, physicsWorld, prefabModeActive,
    activeObjectId, selectSceneObject, camera, setCamera });
  useSceneSaveShortcut({
    disabled: prefabModeActive || playback.active || timeline.playing || !sceneSync.loaded,
    save: sceneSync.saveNow,
  });
  useSceneStartupNormalization({
    loaded: sceneSync.loaded,
    creatingInitialScene: sceneSync.creatingInitialScene,
    setObjects,
    environment,
    setEnvironment,
    hdris: hdriLibrary.hdris,
  });
  const editorActiveObject = prefabModeActive ? prefab.activeObject : activeObject;
  const stageObjects = prefabModeActive
    ? prefab.objects
    : playback.mode === "edit" ? sceneAnimation.evaluatedObjects : objects;
  const cameras = useCameraCoordination({
    camera,
    setCamera,
    sceneObjects: objects,
    stageObjects,
    activeCameraId,
    setActiveCameraId,
    updateSceneObject: sceneCommands.updateObject,
    prefabObjects: prefab.objects,
    prefabActiveCameraId: prefab.activeCameraId,
    updatePrefabObject: prefab.updateObject,
    prefabModeActive,
    prefabSessionKey: prefab.state?.asset.filename,
  });
  useEditorKeyboardShortcuts({
    onTransformModeChange: setTransformMode,
    onUndo: prefabModeActive ? prefab.undo : objectsHistory.undo,
    onRedo: prefabModeActive ? prefab.redo : objectsHistory.redo,
    onDuplicate: prefabModeActive ? undefined : sceneCommands.duplicateActive,
    onDelete: prefabModeActive ? undefined : sceneCommands.deleteActive,
  });
  const scenePaneActive = isDockPaneActive(dockController, "scene");
  const gamePaneActive = isDockPaneActive(dockController, "game");
  const animationPaneActive = isDockPaneActive(dockController, "animation");
  const animatorPaneActive = isDockPaneActive(dockController, "animator");
  const sequencerPaneActive = isDockPaneActive(dockController, "sequencer");
  const inspectorPaneActive = isDockPaneActive(dockController, "inspector");
  const scenePaneShared = { transformMode, setTransformMode, prefs: editorPrefs, selection, playback };

  return (
    <EditorApplicationShell
      controller={dockController}
      playbackMode={playback.mode}
      onConsoleErrorPause={playback.mode === "playing" ? playback.togglePause : undefined}
      topBar={(
        <EditorTopBar
          dockController={dockController}
          prefabModeActive={prefabModeActive}
          canUndo={prefab.state ? prefab.state.past.length > 0 : objectsHistory.canUndo}
          canRedo={prefab.state ? prefab.state.future.length > 0 : objectsHistory.canRedo}
          undo={prefabModeActive ? prefab.undo : objectsHistory.undo}
          redo={prefabModeActive ? prefab.redo : objectsHistory.redo}
          playback={playback}
          saveStatus={sceneSync}
          inspectorTarget={selection.inspectorTarget}
          showPhysicsSettings={selection.showPhysicsSettings}
          showRenderSettings={selection.showRenderSettings}
        />
      )}
      project={(
        <ProjectPane
          assets={assetLibrary}
          assetIntegration={assetIntegration}
          hdris={hdriLibrary}
          materials={materialStore}
          selection={selection}
          prefab={prefab}
          activeObject={editorActiveObject}
          assignSceneMaterial={materialIntegration.assignSceneMaterial}
          environment={environment}
          setEnvironment={setEnvironment}
        />
      )}
      hierarchy={(
        <HierarchyPane
          sceneObjects={objects}
          sceneActiveObjectId={activeObjectId}
          setSceneActiveCameraId={setActiveCameraId}
          selectSceneObject={selectSceneObject}
          sceneCommands={sceneCommands}
          prefab={prefab}
          cameras={cameras}
          assets={assetIntegration}
          materials={materialStore.materials}
          assignSceneMaterial={materialIntegration.assignSceneMaterial}
        />
      )}
      sceneToolbar={<ScenePaneToolbar {...scenePaneShared} />}
      scene={(
        <ScenePane
          {...scenePaneShared}
          active={scenePaneActive}
          loaded={sceneSync.loaded}
          stageObjects={stageObjects}
          sceneObjects={objects}
          materials={materialStore.materials}
          sceneActiveObjectId={activeObjectId}
          selectSceneObject={selectSceneObject}
          sceneCommands={sceneCommands}
          prefab={prefab}
          cameras={cameras}
          camera={camera}
          cameraPreviewAspect={gameViewAspectRatio(gameViewSettings.activeAspectPreset)}
          liveTransforms={liveTransforms}
          assets={assetIntegration}
          environment={environment}
          setEnvironment={setEnvironment}
          physics={physicsWorld}
          animation={sceneAnimation}
          timeline={timeline}
          onAnimatorPlaybackBindingChange={animatorPlayback.setSceneBinding}
          subscribeImportedClipPreview={importedClipPreview.subscribe}
        />
      )}
      gameToolbar={(
        <GamePaneToolbar
          settings={gameViewSettings}
          cameras={cameras}
          playback={playback}
          setActiveCameraId={setActiveCameraId}
        />
      )}
      game={(
        <GamePane
          active={gamePaneActive}
          loaded={sceneSync.loaded}
          objects={stageObjects}
          authoredObjects={objects}
          materials={materialStore.materials}
          cameras={cameras}
          settings={gameViewSettings}
          environment={environment}
          playback={playback}
          physics={physicsWorld}
          animation={sceneAnimation}
          timeline={timeline}
          prefabModeActive={prefabModeActive}
          subscribeLiveObjectTransform={liveTransforms.subscribe}
          onAnimatorPlaybackBindingChange={animatorPlayback.setGameBinding}
        />
      )}
      animation={(
        <AnimationPane key={sceneSync.sceneInstanceId} load={dockController.isPaneOpen("animation")} active={animationPaneActive}
          controller={sceneAnimation}
          assets={assetLibrary.assets}
          refreshAssets={assetLibrary.refresh}
          eventInspector={selection.animationClipEventInspector}
          importedClipPreview={importedClipPreview}
        />
      )}
      animator={(
        dockController.isPaneOpen("animator") ? <LazyAnimatorDockPane key={sceneSync.sceneInstanceId}
          target={animatorWorkspace.target} active={animatorPaneActive}
          playbackMode={playback.mode}
          playbackBinding={animatorPlayback.binding}
          scene={{ objects, updateObject: sceneCommands.updateObject }}
          prefab={prefab.state ? {
            assetFilename: prefab.state.asset.filename,
            objects: prefab.objects,
            updateObject: prefab.updateObject,
          } : null}
        /> : null
      )}
      sequencer={(
        <SequencerPane key={sceneSync.sceneInstanceId}
          load={dockController.isPaneOpen("sequencer")}
          active={sequencerPaneActive}
          controller={timeline}
          objects={objects}
          activeObjectId={activeObjectId}
        />
      )}
      inspector={(
        <InspectorPane
          active={inspectorPaneActive}
          sceneObjects={objects}
          activeSceneObject={activeObject}
          activeCameraId={activeCameraId}
          setActiveCameraId={setActiveCameraId}
          sceneCommands={sceneCommands}
          selection={selection}
          prefab={prefab}
          cameras={cameras}
          assets={assetLibrary}
          assetIntegration={assetIntegration}
          hdris={hdriLibrary}
          materials={materialStore}
          environment={environment}
          setEnvironment={setEnvironment}
          physics={physicsWorld}
          animation={sceneAnimation}
          beginHistoryTransaction={objectsHistory.beginTransaction}
          endHistoryTransaction={objectsHistory.endTransaction}
          openAnimatorWorkspace={openAnimatorWorkspace}
        />
      )}
    />
  );
}
