import { useEffect } from "react";
import type { ImportedClipPreviewChannel } from "../../animation/application/imported-clip-preview-channel";
import type { AnimatorWorkspaceSession } from "../../character/application/useAnimatorWorkspaceSession";
import type { EditorSelectionController } from "../../editor/selection/useEditorSelection";
import type { useSceneSync } from "../../hooks/useSceneSync";

/** Retire scene-specific UI bindings while keeping project navigation and dock panes alive. */
export function useSceneActivation({ sceneSync, selection, animatorWorkspace, importedClipPreview }: {
  sceneSync: ReturnType<typeof useSceneSync>;
  selection: EditorSelectionController;
  animatorWorkspace: AnimatorWorkspaceSession;
  importedClipPreview: ImportedClipPreviewChannel;
}) {
  const { resetSceneSelection } = selection;
  const { close } = animatorWorkspace;
  useEffect(() => {
    resetSceneSelection(); close(); importedClipPreview.clear();
  }, [sceneSync.sceneInstanceId, resetSceneSelection, close, importedClipPreview]);
}
