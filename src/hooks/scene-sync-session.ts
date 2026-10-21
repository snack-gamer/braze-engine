export type SceneAutosaveSafety =
  | "loading"
  | "enabled"
  | "explicit-replacement-required";

export type SceneSyncSession = Readonly<{
  autosaveSafety: SceneAutosaveSafety;
  serverRevision: string | null;
}>;

export type SceneSaveIntent = "automatic" | "explicit";

export type SceneSyncLifetime = Readonly<{
  generation: number;
  active: boolean;
}>;

export type SceneSaveAvailability = Readonly<{
  loaded: boolean;
  playModeActive: boolean;
  session: SceneSyncSession;
}>;

export type SceneExitSavePolicy = SceneSaveAvailability & Readonly<{
  dirty: boolean;
  pendingSaves: number;
  keepaliveEligible: boolean;
}>;

export function createSceneSyncSession(): SceneSyncSession {
  return { autosaveSafety: "loading", serverRevision: null };
}

export function createSceneSyncLifetime(): SceneSyncLifetime {
  return { generation: 0, active: false };
}

export function activateSceneSyncLifetime(lifetime: SceneSyncLifetime): SceneSyncLifetime {
  return { generation: lifetime.generation + 1, active: true };
}

export function retireSceneSyncLifetime(
  lifetime: SceneSyncLifetime,
  generation: number,
): SceneSyncLifetime {
  return lifetime.generation === generation
    ? { ...lifetime, active: false }
    : lifetime;
}

export function isCurrentSceneSyncGeneration(
  lifetime: SceneSyncLifetime,
  generation: number,
): boolean {
  return lifetime.active && lifetime.generation === generation;
}

/** Records the concurrency token before decoding, so a bad document can be replaced safely. */
export function recordFetchedSceneRevision(
  session: SceneSyncSession,
  serverRevision: string | null,
): SceneSyncSession {
  return { ...session, serverRevision };
}

export function beginSceneLoad(session: SceneSyncSession): SceneSyncSession {
  return { ...session, autosaveSafety: "loading" };
}

export function completeSceneLoad(session: SceneSyncSession): SceneSyncSession {
  return { ...session, autosaveSafety: "enabled" };
}

export function failSceneLoad(session: SceneSyncSession): SceneSyncSession {
  return { ...session, autosaveSafety: "explicit-replacement-required" };
}

export function completeSceneSave(
  session: SceneSyncSession,
  serverRevision: string,
  intent: SceneSaveIntent,
): SceneSyncSession {
  return {
    serverRevision,
    autosaveSafety: intent === "explicit" ? "enabled" : session.autosaveSafety,
  };
}

export function automaticSceneSaveEligible({
  loaded,
  playModeActive,
  session,
}: SceneSaveAvailability): boolean {
  return loaded && !playModeActive && session.autosaveSafety === "enabled";
}

export function explicitSceneSaveEligible({
  loaded,
  playModeActive,
}: SceneSaveAvailability): boolean {
  return loaded && !playModeActive;
}

export function pagehideSceneSaveEligible(policy: SceneExitSavePolicy): boolean {
  return automaticSceneSaveEligible(policy)
    && policy.dirty
    && policy.pendingSaves === 0
    && policy.keepaliveEligible;
}

/** Warn only when dirty authored state has no eligible teardown flush path. */
export function beforeUnloadWarningRequired(policy: SceneExitSavePolicy): boolean {
  return policy.loaded && policy.dirty && !pagehideSceneSaveEligible(policy);
}
