import { useCallback, useEffect, useRef, useState } from "react";
import { saveProjectSection, type ProjectFile } from "../../lib/project-api";
import { useProjectSectionHydration } from "../../project/persistence/useProjectSectionHydration";
import { decodeProjectLayerCatalog, DEFAULT_LAYER_CATALOG, type ProjectLayerCatalog } from "../serialization/project-layer-catalog";

/** Explicit project settings writes use the existing revision/merge/backup boundary. */
export function useProjectLayers() {
  const [catalog, setCatalog] = useState<ProjectLayerCatalog>(DEFAULT_LAYER_CATALOG);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), writing = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const remoteValue = useCallback((project: ProjectFile) => decodeProjectLayerCatalog(project.entityLayers), []);
  const hydration = useProjectSectionHydration({ section: "entityLayers", initialValue: DEFAULT_LAYER_CATALOG, currentValue: catalog,
    remoteValue, applyValue: setCatalog });
  const saveNames = async (names: readonly string[]) => {
    if (!hydration.ready || writing.current) return;
    writing.current = true;
    const request = ++generation.current;
    setSaving(true); setError("");
    try {
      const next = decodeProjectLayerCatalog({ version: 1, names });
      const project = await saveProjectSection("entityLayers", next);
      if (request === generation.current) hydration.acceptPersistedValue(catalog, decodeProjectLayerCatalog(project.entityLayers));
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally { writing.current = false; if (request === generation.current) setSaving(false); }
  };
  return { catalog, saveNames, saving, ready: hydration.ready,
    error: error || (hydration.phase === "error" || hydration.phase === "conflict" ? "Project layers could not load. Reload before editing." : "") };
}
