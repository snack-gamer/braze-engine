import { useCallback, useEffect, useRef, useState } from "react";
import { saveProjectSection, type ProjectFile } from "../../lib/project-api";
import { useProjectSectionHydration } from "../../project/persistence/useProjectSectionHydration";
import { decodeProjectTagCatalog, EMPTY_TAG_CATALOG, type ProjectTagCatalog } from "../serialization/project-tag-catalog";

/** Explicit project settings writes use the existing revision/merge/backup boundary. */
export function useProjectTags() {
  const [catalog, setCatalog] = useState<ProjectTagCatalog>(EMPTY_TAG_CATALOG);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), writing = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const remoteValue = useCallback((project: ProjectFile) => decodeProjectTagCatalog(project.entityTags), []);
  const hydration = useProjectSectionHydration({ section: "entityTags", initialValue: EMPTY_TAG_CATALOG, currentValue: catalog,
    remoteValue, applyValue: setCatalog });
  const saveNames = async (names: readonly string[]) => {
    if (!hydration.ready || writing.current) return false;
    writing.current = true;
    const request = ++generation.current;
    setSaving(true); setError("");
    try {
      const next = decodeProjectTagCatalog({ version: 1, names });
      const project = await saveProjectSection("entityTags", next);
      if (request !== generation.current) return false;
      hydration.acceptPersistedValue(catalog, decodeProjectTagCatalog(project.entityTags));
      return true;
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally { writing.current = false; if (request === generation.current) setSaving(false); }
  };
  return { catalog, saveNames, saving, ready: hydration.ready,
    error: error || (hydration.phase === "error" || hydration.phase === "conflict" ? "Project tags could not load. Reload before editing." : "") };
}
