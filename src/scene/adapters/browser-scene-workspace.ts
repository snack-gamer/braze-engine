import { deleteSavedScene, fetchSavedSceneDocument, listSavedScenes, saveScene } from "../../lib/scene-api";
import { createSceneWorkspace } from "../application/scene-workspace";
import { createSceneTemplate } from "../application/scene-templates";
import { createBrowserSceneSelection } from "./browser-scene-selection";

export function createBrowserSceneWorkspace() {
  const selection = createBrowserSceneSelection({
    url: () => new URL(window.location.href),
    replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
    read: (key) => window.sessionStorage.getItem(key),
    write: (key, value) => window.sessionStorage.setItem(key, value),
  });
  const workspace = createSceneWorkspace({
    initialId: selection.initialId, enter: selection.enter, remember: selection.remember,
    remove: deleteSavedScene, list: listSavedScenes, read: fetchSavedSceneDocument,
    write: (scene, id) => saveScene(scene, null, id),
    create: createSceneTemplate, newId: () => `scene-${crypto.randomUUID()}`,
  });
  if (selection.error) workspace.reportError(selection.error);
  return workspace;
}
