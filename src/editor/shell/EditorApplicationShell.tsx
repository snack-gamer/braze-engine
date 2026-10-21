import type { ReactNode } from "react";
import {
  EditorDockWorkspace,
  type EditorDockController,
} from "../../docking/EditorDockWorkspace";
import { CharacterAssetLibraryProvider } from "../../character/application/CharacterAssetLibraryProvider";
import type { ScenePlaybackMode } from "../../types";
import { DeferredConsoleWindow } from "../console/DeferredConsoleWindow";
import { EditorConsoleProvider } from "../console/EditorConsoleProvider";
import { AnimatorDiagnosticProvider } from "../playback/AnimatorDiagnosticProvider";
import { EditorStatusBar } from "../status-bar/EditorStatusBar";
import { EditorStatusProvider } from "../status-bar/EditorStatusProvider";

type EditorApplicationShellProps = {
  controller: EditorDockController;
  playbackMode: ScenePlaybackMode;
  onConsoleErrorPause?: () => void;
  topBar: ReactNode;
  project: ReactNode;
  hierarchy: ReactNode;
  scene: ReactNode;
  sceneToolbar: ReactNode;
  game: ReactNode;
  gameToolbar: ReactNode;
  animation: ReactNode;
  animator: ReactNode;
  sequencer: ReactNode;
  inspector: ReactNode;
};

/** Thin visual composition for the fixed editor pane registry. */
export function EditorApplicationShell({
  controller,
  playbackMode,
  onConsoleErrorPause,
  topBar,
  project,
  hierarchy,
  scene,
  sceneToolbar,
  game,
  gameToolbar,
  animation,
  animator,
  sequencer,
  inspector,
}: EditorApplicationShellProps) {
  return (
    <EditorStatusProvider>
      <EditorConsoleProvider mode={playbackMode} onErrorPause={onConsoleErrorPause}>
        <CharacterAssetLibraryProvider>
          <AnimatorDiagnosticProvider mode={playbackMode}>
            <div
              className="app-shell"
              data-playback-mode={playbackMode}
              onContextMenu={(event) => event.preventDefault()}
            >
              {topBar}
              <EditorDockWorkspace
                controller={controller}
                panes={{
                  project: { title: "Project", icon: "folder", content: project },
                  hierarchy: { title: "Hierarchy", icon: "object", content: hierarchy },
                  scene: { title: "Scene", icon: "gridView", toolbar: sceneToolbar, content: scene },
                  game: { title: "Game", icon: "gameView", toolbar: gameToolbar, content: game },
                  console: {
                    title: "Console",
                    icon: "console",
                    content: <DeferredConsoleWindow load={controller.isPaneOpen("console")} />,
                  },
                  animation: { title: "Animation", icon: "workflowAnimation", content: animation },
                  animator: { title: "Behavior Map", icon: "animator", content: animator },
                  sequencer: { title: "Sequencer", icon: "workflowSequencer", content: sequencer },
                  inspector: { title: "Inspector", icon: "inspector", content: inspector },
                }}
              />
              <EditorStatusBar />
            </div>
          </AnimatorDiagnosticProvider>
        </CharacterAssetLibraryProvider>
      </EditorConsoleProvider>
    </EditorStatusProvider>
  );
}
