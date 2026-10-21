import { useSceneMutationScope } from "../../scene/hooks/useSceneMutationScope";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SceneObject } from "../../types";
import type { AssetAnimationClipInfo } from "../../three/assets";
import { importMotionClipSources } from "../motion-import";
import { motionClipSourceId } from "../motion";
import type { MotionClipSource } from "../types";

type UseMotionSourcesOptions = {
  activeObject: SceneObject | null;
  activeObjectId: string;
  documentSources: MotionClipSource[];
  addSourcesToDocument: (sources: MotionClipSource[]) => void;
};

export function useMotionSources({
  activeObject,
  activeObjectId,
  documentSources,
  addSourcesToDocument,
}: UseMotionSourcesOptions) {
  const scope = useSceneMutationScope();
  const [clipSources, setClipSources] = useState<Record<string, MotionClipSource[]>>({});
  const [motionImporting, setMotionImporting] = useState(false);
  const [motionImportError, setMotionImportError] = useState("");

  useEffect(() => { setClipSources({}); setMotionImporting(false); setMotionImportError(""); }, [scope]);

  const motionClipSources = useMemo(() => {
    const merged = new Map<string, MotionClipSource>();
    for (const source of documentSources.filter((item) => item.objectId === activeObjectId)) {
      merged.set(source.id, source);
    }
    for (const source of clipSources[activeObjectId] ?? []) merged.set(source.id, source);
    return [...merged.values()];
  }, [activeObjectId, clipSources, documentSources]);

  const registerMotionClips = useCallback((objectId: string, clips: AssetAnimationClipInfo[]) => {
    if (!scope.current()) return;
    setClipSources((current) => {
      const sources = clips.map((clip): MotionClipSource => ({
        id: motionClipSourceId(objectId, clip.id),
        objectId,
        sourceUrl: clip.sourceUrl,
        sourceType: clip.sourceType,
        name: clip.name,
        duration: clip.duration,
        trackCount: clip.trackCount,
        clipIndex: clip.index,
        retarget: false,
      }));
      const previous = current[objectId] ?? [];
      if (
        previous.length === sources.length &&
        previous.every((source, index) => source.id === sources[index].id && source.duration === sources[index].duration)
      ) {
        return current;
      }
      return { ...current, [objectId]: sources };
    });
  }, [scope]);

  const importMotionFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !activeObject) return;
      setMotionImporting(true);
      setMotionImportError("");
      try {
        const sources = await importMotionClipSources(activeObject.id, files);
        if (!scope.current()) return;
        if (sources.length === 0) {
          setMotionImportError("No animation clips found in selected file.");
          return;
        }
        addSourcesToDocument(sources);
        setClipSources((current) => {
          const merged = new Map((current[activeObject.id] ?? []).map((source) => [source.id, source]));
          for (const source of sources) merged.set(source.id, source);
          return { ...current, [activeObject.id]: [...merged.values()] };
        });
      } catch (caught) {
        if (!scope.current()) return;
        setMotionImportError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (scope.current()) setMotionImporting(false);
      }
    },
    [activeObject, addSourcesToDocument, scope],
  );

  return {
    motionClipSources,
    motionImporting,
    motionImportError,
    registerMotionClips,
    importMotionFiles,
  };
}
