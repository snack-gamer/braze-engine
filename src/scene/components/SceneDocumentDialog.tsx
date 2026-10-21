import { useEffect, useRef, useState } from "react";
import { useSceneWorkspaceState } from "./SceneWorkspaceContext";
import type { SceneTemplate } from "../application/scene-templates";

export function SceneDocumentDialog() {
  const { controller, snapshot } = useSceneWorkspaceState();
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = snapshot?.dialog;
  const [name, setName] = useState(kind === "rename" ? snapshot?.editor.name ?? "" : kind === "copy" ? `${snapshot?.editor.name} Copy` : "New Scene");
  const [template, setTemplate] = useState<SceneTemplate>("basic");
  useEffect(() => { dialog.current?.showModal(); }, []);
  if (!controller || !snapshot) return null;
  const submit = async () => {
    try {
      if (kind === "rename") await controller.rename(name);
      else await controller.create(name, template, kind === "copy");
    } catch (error) { controller.reportError(error); }
  };
  return <dialog ref={dialog} className="scene-document-dialog" onCancel={(event) => { event.preventDefault(); controller.showDialog(null); }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h2>{kind === "rename" ? "Rename Scene" : kind === "copy" ? "Save Scene Copy" : "New Scene"}</h2>
      <label>Scene name<input autoFocus value={name} maxLength={128} onChange={(event) => setName(event.target.value)} disabled={snapshot.busy} /></label>
      {kind === "new" && <label>Template<select value={template} onChange={(event) => setTemplate(event.target.value as SceneTemplate)} disabled={snapshot.busy}>
        <option value="basic">Basic 3D — sky, camera and light</option><option value="empty">Empty</option>
      </select></label>}
      <p>{kind === "rename" ? "The scene keeps its identity and references." : "Your current scene is saved before the new scene opens."}</p>
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      <footer><button type="button" onClick={() => controller.showDialog(null)} disabled={snapshot.busy}>Cancel</button>
        <button type="submit" disabled={snapshot.busy || !name.trim()}>{kind === "rename" ? "Rename" : kind === "copy" ? "Save Copy" : "Create Scene"}</button></footer>
    </form>
  </dialog>;
}
