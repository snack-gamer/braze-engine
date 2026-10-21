import { activeSceneInstance } from "../domain/scene-session";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { SceneWorkspaceController } from "../application/scene-workspace";

export const SceneWorkspaceContext = createContext<SceneWorkspaceController | null>(null);
export const useSceneWorkspace = () => useContext(SceneWorkspaceContext);
export function useSceneWorkspaceState() {
  const controller = useSceneWorkspace();
  const snapshot = useSyncExternalStore(controller?.subscribe ?? subscribeNone, controller?.getSnapshot ?? emptySnapshot);
  return { controller, snapshot, activeScene: snapshot ? activeSceneInstance(snapshot.session) : null };
}
const subscribeNone = () => () => undefined;
const emptySnapshot = () => null;
