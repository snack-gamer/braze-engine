import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetRef } from "../../assets/domain/asset-reference";
import { saveProjectSection, type ProjectFile } from "../../lib/project-api";
import { useProjectSectionHydration } from "../../project/persistence/useProjectSectionHydration";
import type { ProjectInputSettings } from "../domain/input-action-map-asset";
import { decodeProjectInput, EMPTY_PROJECT_INPUT, encodeProjectInput } from "../serialization/project-input-codec";
import { publishProjectInputSelection, subscribeProjectInputSelection } from "./project-input-selection-channel";

/** Explicit project selection writes preserve the GUID through moves and deletion. */
export function useProjectInput() {
  const [settings, setSettings] = useState<ProjectInputSettings>(EMPTY_PROJECT_INPUT);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const remoteValue = useCallback((project: ProjectFile) => decodeProjectInput(project.input), []);
  const hydration = useProjectSectionHydration({ section: "input", initialValue: EMPTY_PROJECT_INPUT,
    currentValue: settings, remoteValue, applyValue: setSettings });
  useEffect(() => subscribeProjectInputSelection((canonical) => {
    if (hydration.ready) hydration.acceptPersistedValue(settings, canonical);
  }), [hydration.ready, hydration.acceptPersistedValue, settings]);
  const select = async (actionMap?: AssetRef) => {
    if (!hydration.ready || pending.current) return;
    pending.current = true;
    const request = ++generation.current;
    setSaving(true); setError("");
    try {
      const next = decodeProjectInput({ version: 1, ...(actionMap ? { actionMap } : {}) });
      const project = await saveProjectSection("input", encodeProjectInput(next));
      if (request === generation.current) {
        const canonical = decodeProjectInput(project.input);
        hydration.acceptPersistedValue(settings, canonical);
        publishProjectInputSelection(canonical);
      }
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally { if (request === generation.current) { pending.current = false; setSaving(false); } }
  };
  return { settings, select, saving, ready: hydration.ready, reload: () => { setError(""); return hydration.retryHydration(); },
    error: error || (hydration.phase === "error" || hydration.phase === "conflict"
      ? "Project input could not load. Reload before selecting a map." : "") };
}
