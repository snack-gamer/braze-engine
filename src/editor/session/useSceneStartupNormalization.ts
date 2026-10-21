import { useSceneMutationScope } from "../../scene/hooks/useSceneMutationScope";
import { useEffect, useRef } from "react";
import type { HistoryUpdater } from "../../history/history-state";
import { normalizeBotTransformBaseline } from "../../lib/bots";
import type { LibraryAsset } from "../../lib/api";
import type { EnvironmentSettings, SceneObject } from "../../types";
import type { Dispatch, SetStateAction } from "react";

type SceneStartupNormalizationInput = {
  loaded: boolean;
  creatingInitialScene: boolean;
  setObjects: (updater: HistoryUpdater<SceneObject[]>) => void;
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
  hdris: LibraryAsset[];
};

/** Runs backward-compatible authored defaults exactly once after scene hydration. */
export function useSceneStartupNormalization({
  loaded,
  creatingInitialScene,
  setObjects,
  environment,
  setEnvironment,
  hdris,
}: SceneStartupNormalizationInput): void {
  const { generation } = useSceneMutationScope();
  const normalizedBotsRef = useRef(-1);
  const selectedInitialHdriRef = useRef(false);

  useEffect(() => {
    if (!loaded || normalizedBotsRef.current === generation) return;
    setObjects((items) => {
      let changed = false;
      const next = items.map((object) => {
        const normalized = normalizeBotTransformBaseline(object);
        if (normalized !== object) changed = true;
        return normalized;
      });
      normalizedBotsRef.current = generation;
      return changed ? next : items;
    });
  }, [generation, loaded, setObjects]);

  useEffect(() => {
    if (!loaded || !creatingInitialScene) return;
    if (selectedInitialHdriRef.current) return;
    if (environment.hdriUrl) {
      selectedInitialHdriRef.current = true;
      return;
    }
    const first = hdris[0];
    if (!first) return;
    selectedInitialHdriRef.current = true;
    setEnvironment((current) => ({ ...current, hdriUrl: first.url, hdriName: first.name }));
  }, [creatingInitialScene, environment.hdriUrl, hdris, loaded, setEnvironment]);
}
