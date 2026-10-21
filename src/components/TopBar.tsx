import { lazy, Suspense, useState } from "react";
import type { ScenePlaybackMode } from "../types";
import { EditorIcon } from "../ui/EditorIcon";

const LazyShortcutsModal = lazy(async () => {
  const module = await import("./ShortcutsModal");
  return { default: module.ShortcutsModal };
});

type TopBarProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  animationMode: boolean;
  toggleAnimationMode: () => void;
  sequencerMode: boolean;
  toggleSequencerMode: () => void;
  consoleMode: boolean;
  toggleConsoleMode: () => void;
  scenePlaybackMode: ScenePlaybackMode;
  scenePlaybackDisabled: boolean;
  onSceneTogglePlay: () => void;
  onSceneTogglePause: () => void;
  onSceneStep: () => void;
  sceneSaveDirty: boolean;
  sceneSaving: boolean;
  sceneSavedAt: string | null;
  sceneSaveError: string;
  sceneSaveDisabled: boolean;
  onSceneSave: () => void;
  physicsSettingsActive: boolean;
  togglePhysicsSettings: () => void;
  renderSettingsActive: boolean;
  toggleRenderSettings: () => void;
};

export function TopBar(props: TopBarProps) {
  const {
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    animationMode,
    toggleAnimationMode,
    sequencerMode,
    toggleSequencerMode,
    consoleMode,
    toggleConsoleMode,
    scenePlaybackMode,
    scenePlaybackDisabled,
    onSceneTogglePlay,
    onSceneTogglePause,
    onSceneStep,
    sceneSaveDirty,
    sceneSaving,
    sceneSavedAt,
    sceneSaveError,
    sceneSaveDisabled,
    onSceneSave,
    physicsSettingsActive,
    togglePhysicsSettings,
    renderSettingsActive,
    toggleRenderSettings,
  } = props;
  const [showShortcuts, setShowShortcuts] = useState(false);
  const modKey = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";
  const playModeActive = scenePlaybackMode !== "edit";
  const paused = scenePlaybackMode === "paused";
  const savedTime = sceneSavedAt
    ? new Date(sceneSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const sceneSaveTitle = playModeActive
    ? "Scene saving is unavailable in Play Mode"
    : sceneSaving
      ? "Saving scene…"
      : sceneSaveError
        ? `Save scene (${modKey}+S) — ${sceneSaveError}`
        : sceneSaveDirty
          ? `Save scene (${modKey}+S) — unsaved changes`
          : savedTime
            ? `Save scene (${modKey}+S) — saved ${savedTime}`
            : `Save scene (${modKey}+S)`;
  return (
    <header
      className={`topbar ${playModeActive ? "topbar--playmode" : ""} topbar--${scenePlaybackMode}`}
      data-playback-mode={scenePlaybackMode}
    >
      <div className="brand">
        <span className="brand-mark">
          <EditorIcon name="appMark" size="brand" />
        </span>
        <div className="brand-meta">
          <h1>Braze Engine</h1>
          <p>Game Engine</p>
        </div>
      </div>

      <div
        className={`playback-cluster ${playModeActive ? "is-playmode" : ""}`}
        role="toolbar"
        aria-label="Scene playback"
      >
        <button
          className={`icon-button playback-button playback-button--play ${playModeActive ? "active" : ""}`}
          type="button"
          onClick={onSceneTogglePlay}
          disabled={scenePlaybackDisabled}
          title={playModeActive ? "Exit Play Mode" : "Enter Play Mode"}
          aria-label={playModeActive ? "Exit Play Mode" : "Enter Play Mode"}
          aria-pressed={playModeActive}
        >
          <EditorIcon name="play" size="transport" weight="fine" filled />
        </button>
        <button
          className={`icon-button playback-button ${paused ? "active" : ""}`}
          type="button"
          onClick={onSceneTogglePause}
          disabled={scenePlaybackDisabled || !playModeActive}
          title={paused ? "Resume" : "Pause"}
          aria-label={paused ? "Resume" : "Pause"}
          aria-pressed={paused}
        >
          <EditorIcon name="pause" size="transport" weight="fine" filled />
        </button>
        <button
          className="icon-button playback-button"
          type="button"
          onClick={onSceneStep}
          disabled={scenePlaybackDisabled}
          title="Step one frame"
          aria-label="Step one frame"
        >
          <EditorIcon name="stepFrame" size="transport" weight="fine" filled />
        </button>
      </div>

      <div className="top-actions">
        <button
          type="button"
          className={`icon-button scene-save-button ${sceneSaveDirty ? "active" : ""} ${sceneSaveError ? "danger" : ""}`}
          onClick={onSceneSave}
          disabled={sceneSaveDisabled || sceneSaving}
          title={sceneSaveTitle}
          aria-label={sceneSaveTitle}
          aria-busy={sceneSaving}
        >
          <EditorIcon name="save" size="toolbar" />
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="top-pass-cluster" role="toolbar" aria-label="Workflow windows">
          <button
            type="button"
            aria-pressed={animationMode}
            className={`icon-button animation-workflow-toggle ${animationMode ? "active" : ""}`}
            onClick={toggleAnimationMode}
            title={animationMode ? "Close animation window" : "Open animation window"}
          >
            <EditorIcon name="workflowAnimation" size="control" />
          </button>
          <button
            type="button"
            aria-pressed={sequencerMode}
            className={`icon-button sequencer-workflow-toggle ${sequencerMode ? "active" : ""}`}
            onClick={toggleSequencerMode}
            title={sequencerMode ? "Close sequencer window" : "Open sequencer window"}
          >
            <EditorIcon name="workflowSequencer" size="control" />
          </button>
          <button
            type="button"
            aria-label={consoleMode ? "Close Console" : "Open Console"}
            aria-pressed={consoleMode}
            className={`icon-button console-workflow-toggle ${consoleMode ? "active" : ""}`}
            onClick={toggleConsoleMode}
            title={`${consoleMode ? "Close" : "Open"} Console (${modKey}+Shift+C)`}
          >
            <EditorIcon name="console" size="control" />
          </button>
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="history-cluster">
          <button
            className="icon-button"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title={`Undo (${modKey}+Z)`}
          >
            <EditorIcon name="undo" size="toolbar" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title={`Redo (${modKey}+Shift+Z)`}
          >
            <EditorIcon name="redo" size="toolbar" />
          </button>
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={`icon-button ${physicsSettingsActive ? "active" : ""}`}
          onClick={togglePhysicsSettings}
          title="Physics settings"
          aria-label="Physics settings"
          aria-pressed={physicsSettingsActive}
        >
          <EditorIcon name="physicsSettings" size="toolbar" />
        </button>
        <button
          type="button"
          className={`icon-button ${renderSettingsActive ? "active" : ""}`}
          onClick={toggleRenderSettings}
          title="Render settings"
          aria-label="Render settings"
          aria-pressed={renderSettingsActive}
        >
          <EditorIcon name="renderSettings" size="toolbar" />
        </button>
        <button
          className={`icon-button ${showShortcuts ? "active" : ""}`}
          type="button"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
        >
          <EditorIcon name="keyboardShortcuts" size="toolbar" />
        </button>
      </div>
      {showShortcuts && (
        <Suspense fallback={null}>
          <LazyShortcutsModal modKey={modKey} onClose={() => setShowShortcuts(false)} />
        </Suspense>
      )}
    </header>
  );
}
