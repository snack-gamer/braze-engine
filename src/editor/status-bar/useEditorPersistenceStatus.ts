import { useMemo } from "react";
import { projectPersistenceStore } from "../../project/persistence/project-persistence-store";
import { useProjectPersistenceSnapshot } from "../../project/persistence/useProjectPersistenceSnapshot";
import type { ScenePlaybackMode } from "../../types";
import { useEditorStatusPublisher } from "./EditorStatusProvider";
import type { EditorStatusEntry } from "./editor-status-store";

export type ScenePersistenceStatus = {
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  error: string;
  loaded: boolean;
  saveNow: () => Promise<boolean>;
};

type EditorPersistenceStatusInput = {
  scene: ScenePersistenceStatus;
  playbackMode: ScenePlaybackMode;
  sceneSaveDisabled: boolean;
};

/** Bridges persistence and playback state into the shell-owned status stream. */
export function useEditorPersistenceStatus({
  scene,
  playbackMode,
  sceneSaveDisabled,
}: EditorPersistenceStatusInput): void {
  const project = useProjectPersistenceSnapshot();
  const sceneEntry = useMemo<EditorStatusEntry | null>(() => {
    if (scene.error) {
      return { id: "scene-persistence", slot: "activity", label: "Scene not saved", detail: scene.error, tone: "danger", priority: 100 };
    }
    if (!scene.loaded) {
      return { id: "scene-persistence", slot: "activity", label: "Loading scene", tone: "info", priority: 80, busy: true };
    }
    if (scene.saving) {
      return { id: "scene-persistence", slot: "activity", label: "Saving scene", tone: "info", priority: 70, busy: true };
    }
    if (scene.dirty) {
      return {
        id: "scene-persistence",
        slot: "activity",
        label: "Unsaved scene changes",
        tone: "warning",
        priority: 35,
        action: sceneSaveDisabled ? undefined : {
          label: "Save",
          ariaLabel: "Save scene changes",
          run: () => void scene.saveNow(),
        },
      };
    }
    return null;
  }, [scene.dirty, scene.error, scene.loaded, scene.saveNow, scene.saving, sceneSaveDisabled]);

  const projectEntry = useMemo<EditorStatusEntry | null>(() => {
    const affectedSections = Object.values(project.sections)
      .filter((section) => section.phase === project.phase)
      .map((section) => section.section)
      .sort();
    const detail = affectedSections.join(", ");
    if (project.phase === "conflict" || project.phase === "error") {
      const conflict = project.phase === "conflict";
      const label = conflict ? "Project save conflict" : "Project not saved";
      const messages = project.problemSections
        .map((section) => project.sections[section]?.message)
        .filter(Boolean)
        .join(" ");
      const ariaLabel = `${label}: ${project.problemSections.join(", ")}. ${messages}${conflict
        ? " Reload and reconcile before saving again."
        : " Select to retry."}`;
      return {
        id: "project-persistence",
        slot: "activity",
        label,
        detail: project.problemSections.join(", "),
        tone: "danger",
        priority: conflict ? 120 : 110,
        action: conflict ? undefined : {
          label: "Retry",
          ariaLabel,
          run: projectPersistenceStore.retryFailed,
        },
      };
    }
    if (project.phase === "saving") {
      return { id: "project-persistence", slot: "activity", label: "Saving project", detail, tone: "info", priority: 75, busy: true };
    }
    if (project.phase === "dirty") {
      return { id: "project-persistence", slot: "activity", label: "Project changes queued", detail, tone: "warning", priority: 40 };
    }
    return null;
  }, [project]);

  const playbackEntry = useMemo<EditorStatusEntry>(() => ({
    id: "playback-mode",
    slot: "metric",
    label: playbackMode.toUpperCase(),
    detail: "Mode",
    tone: playbackMode === "edit" ? "neutral" : "info",
    priority: 100,
  }), [playbackMode]);

  useEditorStatusPublisher(sceneEntry);
  useEditorStatusPublisher(projectEntry);
  useEditorStatusPublisher(playbackEntry);
}
