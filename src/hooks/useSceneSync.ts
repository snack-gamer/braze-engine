import { useSceneWorkspaceState } from "../scene/components/SceneWorkspaceContext";
import { defaultSceneName, validateSceneName } from "../scene/domain/scene-identity";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  saveSceneIncrementally,
} from "../lib/api";
import type { SceneDocumentV1 } from "../scene/serialization/scene-document";
import { sceneDocumentHasAuthoredChanges } from "../scene/serialization/scene-delta";
import {
  buildSavedScene,
  type ScenePersistenceSnapshot,
} from "../lib/scene-persistence";
import type { HydratedSceneState } from "../scene/application/scene-hydration";
import {
  activateSceneSyncLifetime,
  automaticSceneSaveEligible,
  beginSceneLoad,
  completeSceneLoad,
  completeSceneSave,
  createSceneSyncLifetime,
  createSceneSyncSession,
  explicitSceneSaveEligible,
  failSceneLoad,
  isCurrentSceneSyncGeneration,
  recordFetchedSceneRevision,
  retireSceneSyncLifetime,
  type SceneAutosaveSafety,
  type SceneSaveIntent,
} from "./scene-sync-session";
import { useSceneExitProtection } from "./useSceneExitProtection";

const SAVE_DEBOUNCE_MS = 600;

type Args = ScenePersistenceSnapshot & {
  /** True while in Play Mode — saves are suppressed so play-time edits never persist. */
  playModeActive?: boolean;
  onLoaded: (next: HydratedSceneState) => void;
};

export function useSceneSync({
  objects,
  camera,
  activeObjectId,
  activeCameraId,
  environment,
  physicsWorldSettings,
  timeline,
  animation,
  playModeActive = false,
  onLoaded,
}: Args) {
  const { controller: workspace, activeScene } = useSceneWorkspaceState();
  const sceneId = activeScene?.sceneId ?? "current";
  const sceneInstanceId = activeScene?.instanceId ?? 0;
  const [loadedInstanceId, setLoadedInstanceId] = useState(-1);
  const [name, setName] = useState(defaultSceneName(sceneId));
  const nameRef = useRef(name);
  const [hasLoaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loaded = hasLoaded && loadedInstanceId === sceneInstanceId && !loadFailed;
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [autosaveSafety, setAutosaveSafety] = useState<SceneAutosaveSafety>("loading");

  const timerRef = useRef<number | null>(null);
  const onLoadedRef = useRef(onLoaded);
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const playModeActiveRef = useRef(playModeActive);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const pendingSavesRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef(createSceneSyncSession());
  const lifetimeRef = useRef(createSceneSyncLifetime());
  const savedDocumentRef = useRef<SceneDocumentV1 | null>(null);
  const authoredBaselineRef = useRef<SceneDocumentV1 | null>(null);
  const initialSnapshotPendingRef = useRef(true);
  const createInitialSceneRef = useRef(false);
  const latestSnapshotRef = useRef<ScenePersistenceSnapshot>({
    objects,
    camera,
    activeObjectId,
    activeCameraId,
    environment,
    physicsWorldSettings,
    timeline,
    animation,
  });

  onLoadedRef.current = onLoaded;
  playModeActiveRef.current = playModeActive;
  latestSnapshotRef.current = {
    objects,
    camera,
    activeObjectId,
    activeCameraId,
    environment,
    physicsWorldSettings,
    timeline,
    animation,
  };

  const updateDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  const clearSaveTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const captureDocument = useCallback((): SceneDocumentV1 => ({ ...savedDocumentRef.current, ...buildSavedScene(latestSnapshotRef.current), name: nameRef.current }), []);

  /** Serialize saves so an older, slower request cannot overwrite a newer scene. */
  const enqueueSave = useCallback((
    revision: number,
    intent: SceneSaveIntent,
  ): Promise<boolean> => {
    const lifetime = lifetimeRef.current;
    if (workspace && workspace.getSnapshot().session.activeInstanceId !== sceneInstanceId) return Promise.resolve(false);
    const availability = {
      loaded: loadedRef.current,
      playModeActive: playModeActiveRef.current,
      session: sessionRef.current,
    };
    const eligible = intent === "automatic"
      ? automaticSceneSaveEligible(availability)
      : explicitSceneSaveEligible(availability);
    if (!eligible || !isCurrentSceneSyncGeneration(lifetime, lifetime.generation)) {
      return Promise.resolve(false);
    }

    const generation = lifetime.generation;
    const payload = captureDocument();
    const previousDocument = authoredBaselineRef.current;
    if (
      intent === "automatic"
      && previousDocument
      && !sceneDocumentHasAuthoredChanges(previousDocument, payload)
    ) {
      savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
      updateDirty(revisionRef.current > savedRevisionRef.current);
      setError("");
      return Promise.resolve(true);
    }
    pendingSavesRef.current += 1;
    setSaving(true);

    const run = async (): Promise<boolean> => {
      try {
        if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return false;
        const result = await saveSceneIncrementally(
          payload,
          savedDocumentRef.current,
          sessionRef.current.serverRevision,
          sceneId,
        );
        if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return false;
        sessionRef.current = completeSceneSave(sessionRef.current, result.revision, intent);
        setAutosaveSafety(sessionRef.current.autosaveSafety); setLoadFailed(false);
        savedDocumentRef.current = payload;
        authoredBaselineRef.current = payload;
        savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
        updateDirty(revisionRef.current > savedRevisionRef.current);
        setSavedAt(payload.savedAt ?? null);
        setError("");
        return true;
      } catch (caught) {
        if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return false;
        updateDirty(true);
        setError(caught instanceof Error ? caught.message : String(caught));
        return false;
      } finally {
        if (isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) {
          pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
          if (pendingSavesRef.current === 0) setSaving(false);
        }
      }
    };

    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [captureDocument, sceneId, sceneInstanceId, workspace, updateDirty]);

  const scheduleAutosave = useCallback(() => {
    clearSaveTimer();
    const lifetime = lifetimeRef.current;
    if (
      !automaticSceneSaveEligible({
        loaded: loadedRef.current,
        playModeActive: playModeActiveRef.current,
        session: sessionRef.current,
      })
      || !isCurrentSceneSyncGeneration(lifetime, lifetime.generation)
    ) return;
    const generation = lifetime.generation;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return;
      void enqueueSave(revisionRef.current, "automatic");
    }, SAVE_DEBOUNCE_MS);
  }, [clearSaveTimer, enqueueSave]);

  const saveNow = useCallback((): Promise<boolean> => {
    const lifetime = lifetimeRef.current;
    if (
      !explicitSceneSaveEligible({
        loaded: loadedRef.current,
        playModeActive: playModeActiveRef.current,
        session: sessionRef.current,
      })
      || !isCurrentSceneSyncGeneration(lifetime, lifetime.generation)
    ) return Promise.resolve(false);
    clearSaveTimer();
    return enqueueSave(revisionRef.current, "explicit");
  }, [clearSaveTimer, enqueueSave]);

  // Initial load. A saved empty scene is a real scene and must reach the app;
  // only a null response means there is no scene document yet.
  useEffect(() => {
    clearSaveTimer(); setLoadFailed(false);
    revisionRef.current = 0; savedRevisionRef.current = 0;
    updateDirty(false); setSavedAt(null); setError("");
    nameRef.current = defaultSceneName(sceneId); setName(nameRef.current);
    const lifetime = activateSceneSyncLifetime(lifetimeRef.current);
    lifetimeRef.current = lifetime;
    const generation = lifetime.generation;
    sessionRef.current = beginSceneLoad(createSceneSyncSession());
    setAutosaveSafety(sessionRef.current.autosaveSafety);
    loadedRef.current = false;
    pendingSavesRef.current = 0;
    savedDocumentRef.current = null;
    authoredBaselineRef.current = null;
    setLoaded(false);
    setSaving(false);
    (async () => {
      try {
        if (!workspace) throw new Error("Scene synchronization requires an editor scene session.");
        const prepared = await workspace.loadInstance(sceneInstanceId);
        if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation) || workspace.getSnapshot().session.activeInstanceId !== sceneInstanceId) return;
        const hydrated = prepared.hydration;
        nameRef.current = prepared.name; setName(nameRef.current);
        sessionRef.current = recordFetchedSceneRevision(
          sessionRef.current,
          prepared.revision,
        );
        createInitialSceneRef.current = hydrated === null;

        if (hydrated !== null) {
          savedDocumentRef.current = hydrated.serverDocument;
          authoredBaselineRef.current = { ...hydrated.serverDocument, ...hydrated.authoredBaseline, name: nameRef.current };
          onLoadedRef.current(hydrated.state);
          if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return;
          setSavedAt(typeof hydrated.serverDocument.savedAt === "string" ? hydrated.serverDocument.savedAt : null);
        }
        sessionRef.current = completeSceneLoad(sessionRef.current);
        setAutosaveSafety(sessionRef.current.autosaveSafety);
        setError("");
      } catch (caught) {
        if (!isCurrentSceneSyncGeneration(lifetimeRef.current, generation)) return;
        setLoadFailed(true);
        // Preserve the failed document; Project can open another valid scene.
        createInitialSceneRef.current = false;
        savedDocumentRef.current = null;
        authoredBaselineRef.current = null;
        sessionRef.current = failSceneLoad(sessionRef.current);
        setAutosaveSafety(sessionRef.current.autosaveSafety);
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (isCurrentSceneSyncGeneration(lifetimeRef.current, generation) && workspace?.getSnapshot().session.activeInstanceId === sceneInstanceId) {
          workspace?.acknowledgeHydration(sceneInstanceId);
          initialSnapshotPendingRef.current = true;
          loadedRef.current = true;
          setLoadedInstanceId(sceneInstanceId);
          setLoaded(true);
        }
      }
    })();
    return () => {
      clearSaveTimer();
      lifetimeRef.current = retireSceneSyncLifetime(lifetimeRef.current, generation);
    };
  }, [sceneId, sceneInstanceId, workspace, clearSaveTimer, updateDirty]);

  // Mark authored state changes dirty and debounce them. Play Mode mutations
  // are intentionally excluded; usePlayModeSnapshot restores authored state.
  useEffect(() => {
    if (!loaded) return;
    if (initialSnapshotPendingRef.current) {
      initialSnapshotPendingRef.current = false;
      if (!createInitialSceneRef.current) {
        updateDirty(false);
        return;
      }
    }
    if (playModeActiveRef.current) return;
    revisionRef.current += 1;
    updateDirty(true);
    scheduleAutosave();
  }, [
    objects,
    camera,
    activeObjectId,
    activeCameraId,
    environment,
    physicsWorldSettings,
    timeline,
    animation,
    loaded,
    scheduleAutosave,
    updateDirty,
  ]);

  // Pause a pending authored save on Play Mode entry and resume it after exit.
  useEffect(() => {
    if (!loaded) return;
    if (!automaticSceneSaveEligible({
      loaded: loadedRef.current,
      playModeActive,
      session: sessionRef.current,
    })) {
      clearSaveTimer();
    } else if (dirtyRef.current) {
      scheduleAutosave();
    }
  }, [autosaveSafety, clearSaveTimer, loaded, playModeActive, scheduleAutosave]);

  const readExitState = useCallback(() => ({
    active: lifetimeRef.current.active && (!workspace || workspace.getSnapshot().session.activeInstanceId === sceneInstanceId),
    loaded: loadedRef.current,
    dirty: dirtyRef.current,
    playModeActive: playModeActiveRef.current,
    pendingSaves: pendingSavesRef.current,
    session: sessionRef.current,
    snapshot: latestSnapshotRef.current,
    sceneId,
    document: captureDocument(),
  }), [captureDocument, sceneId, sceneInstanceId, workspace]);
  useSceneExitProtection(readExitState, clearSaveTimer);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const saveBeforeSwitch = useCallback(() => sessionRef.current.autosaveSafety === "enabled"
    ? saveNow() : Promise.resolve(!dirtyRef.current), [saveNow]);
  const rename = useCallback(async (value: string) => {
    if (sessionRef.current.autosaveSafety !== "enabled") return false;
    nameRef.current = validateSceneName(value); setName(nameRef.current);
    revisionRef.current += 1; updateDirty(true);
    return saveNow();
  }, [saveNow, updateDirty]);

  return {
    savedRevision: () => sessionRef.current.serverRevision,
    sceneId, sceneInstanceId, loadFailed, worldSource: environment.worldSource, name, rename, captureDocument, saveBeforeSwitch,
    loaded,
    dirty,
    saving,
    savedAt,
    error,
    saveNow,
    creatingInitialScene: loaded && createInitialSceneRef.current,
  };
}
