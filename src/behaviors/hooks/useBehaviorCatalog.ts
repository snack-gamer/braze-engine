import { useEffect, useState, useSyncExternalStore } from "react";
import { loadProjectBehaviorCatalog } from "../adapters/project-behavior-catalog";
import { createBehaviorCatalog } from "../application/behavior-catalog";

export function useBehaviorCatalog() {
  const [catalog] = useState(() => createBehaviorCatalog(loadProjectBehaviorCatalog));
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.read, catalog.read);
  useEffect(() => { void catalog.reload(); return catalog.cancel; }, [catalog]);
  return { snapshot, reload: catalog.reload };
}
