import { useSyncExternalStore } from "react";
import { projectPersistenceStore } from "./project-persistence-store";

export function useProjectPersistenceSnapshot() {
  return useSyncExternalStore(
    projectPersistenceStore.subscribe,
    projectPersistenceStore.getSnapshot,
    projectPersistenceStore.getSnapshot,
  );
}
