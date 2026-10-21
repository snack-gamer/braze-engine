import { useCallback } from "react";
import type { EditorDockController } from "../../docking/EditorDockWorkspace";
import type { ScenePlaySessionController } from "../session/useScenePlaySaveSession";
import { TopBar } from "../../components/TopBar";
import type { InspectorTarget } from "../../types";
import { useEditorConsoleShortcut } from "../console/useEditorConsoleShortcut";
import {
  useEditorPersistenceStatus,
  type ScenePersistenceStatus,
} from "../status-bar/useEditorPersistenceStatus";

type EditorTopBarProps = {
  dockController: EditorDockController;
  prefabModeActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  playback: ScenePlaySessionController;
  saveStatus: ScenePersistenceStatus;
  inspectorTarget: InspectorTarget;
  showPhysicsSettings: () => void;
  showRenderSettings: () => void;
};

export function EditorTopBar({
  dockController,
  prefabModeActive,
  canUndo,
  canRedo,
  undo,
  redo,
  playback,
  saveStatus,
  inspectorTarget,
  showPhysicsSettings,
  showRenderSettings,
}: EditorTopBarProps) {
  const animationMode = dockController.isPaneOpen("animation");
  const sequencerMode = dockController.isPaneOpen("sequencer");
  const consoleMode = dockController.isPaneOpen("console");
  const toggleConsoleMode = useCallback(() => dockController.togglePane("console"), [dockController.togglePane]);
  useEditorConsoleShortcut(toggleConsoleMode);
  const sceneSaveDisabled = prefabModeActive || !saveStatus.loaded || playback.mode !== "edit";
  useEditorPersistenceStatus({
    scene: saveStatus,
    playbackMode: playback.mode,
    sceneSaveDisabled,
  });
  return (
    <TopBar
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      animationMode={animationMode}
      toggleAnimationMode={() => {
        if (!prefabModeActive) dockController.togglePane("animation");
      }}
      sequencerMode={sequencerMode}
      toggleSequencerMode={() => {
        if (!prefabModeActive) dockController.togglePane("sequencer");
      }}
      consoleMode={consoleMode}
      toggleConsoleMode={toggleConsoleMode}
      scenePlaybackMode={playback.mode}
      scenePlaybackDisabled={prefabModeActive || !saveStatus.loaded}
      onSceneTogglePlay={playback.togglePlay}
      onSceneTogglePause={playback.togglePause}
      onSceneStep={playback.step}
      sceneSaveDirty={saveStatus.dirty}
      sceneSaving={saveStatus.saving}
      sceneSavedAt={saveStatus.savedAt}
      sceneSaveError={saveStatus.error}
      sceneSaveDisabled={sceneSaveDisabled}
      onSceneSave={() => void saveStatus.saveNow()}
      physicsSettingsActive={inspectorTarget === "physics"}
      togglePhysicsSettings={showPhysicsSettings}
      renderSettingsActive={inspectorTarget === "environment"}
      toggleRenderSettings={showRenderSettings}
    />
  );
}
