import { useEffect, useRef } from "react";
import { useSceneWorkspaceState } from "./SceneWorkspaceContext";

export function SceneDeleteDialog() {
  const { controller, snapshot, activeScene } = useSceneWorkspaceState();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const target = snapshot?.deletion;
  if (!controller || !snapshot || !target) return null;
  const active = target.sceneId === activeScene?.sceneId;
  const last = snapshot.scenes.every((scene) => scene.id === target.sceneId);
  return <dialog ref={dialog} className="scene-document-dialog" aria-labelledby="delete-scene-title"
    onCancel={(event) => { event.preventDefault(); controller.showDialog(null); }}>
    <form onSubmit={(event) => { event.preventDefault(); void controller.remove(target).catch(controller.reportError); }}>
      <h2 id="delete-scene-title">Delete Scene</h2>
      <p>Move “{target.name}” to project Trash? Its objects and settings will remain recoverable.</p>
      {active && <p>This scene is open. Its changes will be saved first, then {last ? "a new Basic scene will open" : "another saved scene will open"}.</p>}
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      <footer><button autoFocus type="button" onClick={() => controller.showDialog(null)} disabled={snapshot.busy}>Cancel</button>
        <button type="submit" disabled={snapshot.busy}>Delete Scene</button></footer>
    </form>
  </dialog>;
}
