import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeAuthoredDocumentSaved } from "../../project/persistence/authored-document-events";
import { fetchProjectTagUsage, type TagUsage } from "../adapters/project-tags-api";

/** Fresh on local saves, focus and external changes; active only while settings is mounted. */
export function useProjectTagUsage() {
  const [usage, setUsage] = useState<TagUsage | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async (): Promise<TagUsage | null> => {
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setChecking(true); setError("");
    try {
      const next = await fetchProjectTagUsage(abort.signal);
      if (abort.signal.aborted) return null;
      setUsage(next); return next;
    } catch (failure) {
      if (!abort.signal.aborted) { setUsage(null); setError(String(failure)); }
      return null;
    } finally { if (!abort.signal.aborted) setChecking(false); }
  }, []);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const unsubscribe = subscribeAuthoredDocumentSaved(update);
    const interval = window.setInterval(update, 5000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    // Prefab and scene asset changes from other tabs and external tools.
    const source = new EventSource("/api/asset-database/events");
    source.addEventListener("changed", update);
    source.addEventListener("ready", update);
    update();
    return () => {
      unsubscribe(); window.clearInterval(interval); source.close(); request.current?.abort();
      window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  return { usage, checking, error, refresh };
}
