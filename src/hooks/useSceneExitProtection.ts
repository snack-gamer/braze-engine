import type { SceneDocumentV1 } from "../scene/serialization/scene-document";
import { useEffect } from "react";
import { canKeepaliveSceneSave, tryKeepaliveSceneSave } from "../lib/api";
import { buildSavedScene, type ScenePersistenceSnapshot } from "../lib/scene-persistence";
import {
  beforeUnloadWarningRequired,
  pagehideSceneSaveEligible,
  type SceneExitSavePolicy,
  type SceneSyncSession,
} from "./scene-sync-session";

export type SceneExitState = Readonly<{
  sceneId?: string;
  document?: SceneDocumentV1;
  active: boolean;
  loaded: boolean;
  dirty: boolean;
  playModeActive: boolean;
  pendingSaves: number;
  session: SceneSyncSession;
  snapshot: ScenePersistenceSnapshot;
}>;

/** Protects authored changes during real browser teardown. */
export function useSceneExitProtection(
  readState: () => SceneExitState,
  clearSaveTimer: () => void,
): void {
  useEffect(() => {
    const handlePageHide = () => {
      const state = readState();
      if (!state.active || !pagehideSceneSaveEligible(policyFor(state, true))) return;
      const payload = (state.document ?? buildSavedScene(state.snapshot));
      if (!canKeepaliveSceneSave(payload, state.session.serverRevision)) return;
      if (tryKeepaliveSceneSave(payload, state.session.serverRevision, state.sceneId)) clearSaveTimer();
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = readState();
      if (!state.active) return;
      const teardownCandidate = pagehideSceneSaveEligible(policyFor(state, true));
      const keepaliveEligible = teardownCandidate && canKeepaliveSceneSave(
        (state.document ?? buildSavedScene(state.snapshot)),
        state.session.serverRevision,
      );
      if (!beforeUnloadWarningRequired(policyFor(state, keepaliveEligible))) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [clearSaveTimer, readState]);
}

function policyFor(
  state: SceneExitState,
  keepaliveEligible: boolean,
): SceneExitSavePolicy {
  return {
    loaded: state.loaded,
    dirty: state.dirty,
    playModeActive: state.playModeActive,
    pendingSaves: state.pendingSaves,
    keepaliveEligible,
    session: state.session,
  };
}
