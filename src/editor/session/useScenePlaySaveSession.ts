import { useCallback, useEffect, useState } from "react";
import type { EditorDockController } from "../../docking/EditorDockWorkspace";
import type { HistoryState } from "../../history/history-state";
import { usePlayModeSnapshot } from "../../hooks/usePlayModeSnapshot";
import type { PhysicsWorldController } from "../../physics/application/use-physics-world-controller";
import { usePhysicsPlaybackWorld } from "../../physics/adapters/use-physics-playback-world";
import { useGameplayPlaybackWorld } from "../../gameplay/adapters/useGameplayPlaybackWorld";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import type { SceneObject, ScenePlaybackMode } from "../../types";

type ObjectHistorySnapshot = {
  capture: () => HistoryState<SceneObject[]>;
  restore: (snapshot: HistoryState<SceneObject[]>) => void;
};

type ScenePlaySessionInput = {
  objects: SceneObject[];
  importedAssets?: readonly import("../../lib/asset-api").LibraryAsset[];
  assetsLoaded?: boolean;
  timeline: PrimeTimelineController;
  prefabModeActive: boolean;
  isSceneLoaded: () => boolean;
  activeObjectId: string;
  setActiveObjectId: (id: string) => void;
  objectHistory: ObjectHistorySnapshot;
  physicsWorld: Pick<PhysicsWorldController, "capture" | "restore" | "settings">;
  dockController: Pick<EditorDockController, "closePane">;
};

/** Owns Play/Pause/Step semantics and the non-destructive authored snapshot. */
export function useScenePlaySession({
  objects, importedAssets, assetsLoaded = true,
  timeline,
  prefabModeActive,
  isSceneLoaded,
  activeObjectId,
  setActiveObjectId,
  objectHistory,
  physicsWorld,
  dockController,
}: ScenePlaySessionInput) {
  const [active, setActive] = useState(false);
  const [physicsStepToken, setPhysicsStepToken] = useState(0);
  const { jumpToStart, pause, playForward, playing, stepFrame } = timeline;
  const { closePane } = dockController;
  const playModeActive = !prefabModeActive && (active || playing);
  const mode: ScenePlaybackMode = playModeActive
    ? playing ? "playing" : "paused"
    : "edit";
  usePhysicsPlaybackWorld({ objects, worldSettings: physicsWorld.settings, mode, stepToken: physicsStepToken });
  useGameplayPlaybackWorld({ objects, worldSettings: physicsWorld.settings, mode, stepToken: physicsStepToken }, importedAssets);

  const canControl = useCallback(
    // Background refreshes retain a usable catalog and must not disable transport.
    () => !prefabModeActive && assetsLoaded && isSceneLoaded(),
    [isSceneLoaded, prefabModeActive, assetsLoaded],
  );
  const togglePlay = useCallback(() => {
    if (!canControl()) return;
    if (active || playing) {
      pause();
      jumpToStart();
      setActive(false);
    } else {
      setActive(true);
      playForward();
    }
  }, [active, canControl, jumpToStart, pause, playForward, playing]);
  const togglePause = useCallback(() => {
    if (!canControl()) return;
    if (playing) {
      setActive(true);
      pause();
    } else if (active) {
      playForward();
    }
  }, [active, canControl, pause, playForward, playing]);
  const step = useCallback(() => {
    if (!canControl()) return;
    setActive(true);
    pause();
    stepFrame(1);
    setPhysicsStepToken((value) => value + 1);
  }, [canControl, pause, stepFrame]);

  usePlayModeSnapshot({
    active,
    activeObjectId,
    setActiveObjectId,
    objectHistory,
    physicsWorld,
  });

  useEffect(() => {
    if (!prefabModeActive) return;
    closePane("animation");
    closePane("sequencer");
    setActive(false);
    pause();
  }, [closePane, pause, prefabModeActive]);
  useEffect(() => {
    if (!prefabModeActive && playing) setActive(true);
  }, [playing, prefabModeActive]);

  return { active, mode, physicsStepToken, playModeActive, step, togglePause, togglePlay };
}

type SceneSaveShortcutInput = {
  disabled: boolean;
  save: () => Promise<boolean>;
};

/** Keeps the global save shortcut at the same boundary as save eligibility. */
export function useSceneSaveShortcut({ disabled, save }: SceneSaveShortcutInput): void {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!disabled) void save();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [disabled, save]);
}

export type ScenePlaySessionController = ReturnType<typeof useScenePlaySession>;
