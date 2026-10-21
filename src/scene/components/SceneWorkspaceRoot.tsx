import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { App } from "../../App";
import { connectAutomationEditor } from "../../automation/adapters/editor-connection";
import { createBrowserSceneWorkspace } from "../adapters/browser-scene-workspace";
import { SceneWorkspaceContext } from "./SceneWorkspaceContext";
import { SceneDeleteDialog } from "./SceneDeleteDialog";
import { SceneDocumentDialog } from "./SceneDocumentDialog";
import "./scene-workspace.css";

/** One persistent editor; its scene session owns document/runtime transitions. */
export function SceneWorkspaceRoot() {
  const [controller] = useState(createBrowserSceneWorkspace);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useLayoutEffect(() => controller.beginLifetime(), [controller]);
  useEffect(() => connectAutomationEditor(controller.execute), [controller]);
  useEffect(() => { void controller.refresh().catch(controller.reportError); }, [controller]);
  useEffect(() => {
    const blockDuringTransition = (event: KeyboardEvent) => {
      if (controller.getSnapshot().busy) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", blockDuringTransition, true);
    return () => window.removeEventListener("keydown", blockDuringTransition, true);
  }, [controller]);
  return <SceneWorkspaceContext.Provider value={controller}>
    <div className="scene-workspace" inert={state.busy || (!state.editor.loaded && !state.editor.loadFailed) || state.dialog !== null}>
      <App />
    </div>
    {state.busy && <div className="scene-workspace__busy" role="status">Updating scenes…</div>}
    {state.error && !state.dialog && <div className="scene-workspace__error" role="alert">{state.error}</div>}
    {state.dialog && (state.dialog === "delete" ? <SceneDeleteDialog /> : <SceneDocumentDialog key={state.dialog} />)}
  </SceneWorkspaceContext.Provider>;
}
