import { defaultCamera, defaultEnvironment } from "../../constants";
import type { SavedSceneDocument } from "../../lib/scene-api";
import { validateSceneId, defaultSceneName } from "../domain/scene-identity";
import { hydrateSceneDocument, type SceneHydration } from "./scene-hydration";

export type PreparedSceneDocument = Readonly<{
  sceneId: string;
  name: string;
  revision: string | null;
  hydration: SceneHydration | null;
}>;

/** The sole editor document decoder, run before a successful scene transition. */
export function prepareSceneDocument(sceneId: string, document: SavedSceneDocument, allowInitialScene = false): PreparedSceneDocument {
  validateSceneId(sceneId);
  if (!document.scene && !(allowInitialScene && sceneId === "current")) throw new Error(`Scene '${sceneId}' does not exist.`);
  return {
    sceneId,
    name: document.scene?.name ?? defaultSceneName(sceneId),
    revision: document.revision,
    hydration: document.scene ? hydrateSceneDocument(document.scene, { camera: defaultCamera, environment: defaultEnvironment }) : null,
  };
}
