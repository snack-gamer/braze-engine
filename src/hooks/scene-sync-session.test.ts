import { describe, expect, it } from "vitest";
import {
  activateSceneSyncLifetime,
  automaticSceneSaveEligible,
  beginSceneLoad,
  beforeUnloadWarningRequired,
  completeSceneLoad,
  completeSceneSave,
  createSceneSyncLifetime,
  createSceneSyncSession,
  explicitSceneSaveEligible,
  failSceneLoad,
  isCurrentSceneSyncGeneration,
  pagehideSceneSaveEligible,
  recordFetchedSceneRevision,
  retireSceneSyncLifetime,
  type SceneExitSavePolicy,
  type SceneSyncSession,
} from "./scene-sync-session";

describe("scene sync client lifetime", () => {
  it("rejects completions from retired and superseded hook generations", () => {
    const first = activateSceneSyncLifetime(createSceneSyncLifetime());
    expect(isCurrentSceneSyncGeneration(first, first.generation)).toBe(true);

    const retired = retireSceneSyncLifetime(first, first.generation);
    expect(isCurrentSceneSyncGeneration(retired, first.generation)).toBe(false);

    const second = activateSceneSyncLifetime(retired);
    expect(isCurrentSceneSyncGeneration(second, first.generation)).toBe(false);
    expect(isCurrentSceneSyncGeneration(second, second.generation)).toBe(true);
  });

  it("blocks autosave while a preserved hook instance reloads", () => {
    const loaded = completeSceneLoad(createSceneSyncSession());
    const reloading = beginSceneLoad(loaded);

    expect(reloading.autosaveSafety).toBe("loading");
    expect(automaticSceneSaveEligible(policyFor(reloading))).toBe(false);
  });
});

describe("scene sync load safety", () => {
  it("keeps later edits blocked after decode failure until an explicit replacement succeeds", () => {
    let session = recordFetchedSceneRevision(createSceneSyncSession(), "fetched-r7");
    session = failSceneLoad(session);

    const laterAuthoredEdit = policyFor(session, {
      dirty: true,
      keepaliveEligible: true,
    });
    expect(session.serverRevision).toBe("fetched-r7");
    expect(automaticSceneSaveEligible(laterAuthoredEdit)).toBe(false);
    expect(pagehideSceneSaveEligible(laterAuthoredEdit)).toBe(false);
    expect(beforeUnloadWarningRequired(laterAuthoredEdit)).toBe(true);
    expect(explicitSceneSaveEligible(laterAuthoredEdit)).toBe(true);

    session = completeSceneSave(session, "automatic-r8", "automatic");
    expect(session.autosaveSafety).toBe("explicit-replacement-required");

    session = completeSceneSave(session, "explicit-r9", "explicit");
    const nextAuthoredEdit = policyFor(session, {
      dirty: true,
      keepaliveEligible: true,
    });
    expect(session).toEqual({
      autosaveSafety: "enabled",
      serverRevision: "explicit-r9",
    });
    expect(automaticSceneSaveEligible(nextAuthoredEdit)).toBe(true);
    expect(pagehideSceneSaveEligible(nextAuthoredEdit)).toBe(true);
    expect(beforeUnloadWarningRequired(nextAuthoredEdit)).toBe(false);
  });

  it("enables normal autosave after successful existing or new-scene loads", () => {
    const existing = completeSceneLoad(
      recordFetchedSceneRevision(createSceneSyncSession(), "r1"),
    );
    const created = completeSceneLoad(
      recordFetchedSceneRevision(createSceneSyncSession(), null),
    );

    expect(automaticSceneSaveEligible(policyFor(existing))).toBe(true);
    expect(automaticSceneSaveEligible(policyFor(created))).toBe(true);
  });
});

describe("scene exit save policy", () => {
  const ready = completeSceneLoad(createSceneSyncSession());

  it("allows pagehide only for an idle, dirty, keepalive-sized authored scene", () => {
    expect(pagehideSceneSaveEligible(policyFor(ready, { dirty: true }))).toBe(true);
    expect(pagehideSceneSaveEligible(policyFor(ready, { dirty: false }))).toBe(false);
    expect(pagehideSceneSaveEligible(policyFor(ready, { pendingSaves: 1 }))).toBe(false);
    expect(pagehideSceneSaveEligible(policyFor(ready, { keepaliveEligible: false }))).toBe(false);
    expect(pagehideSceneSaveEligible(policyFor(ready, { playModeActive: true }))).toBe(false);
  });

  it("warns for unflushable authored changes, but not clean Play Mode runtime state", () => {
    expect(beforeUnloadWarningRequired(policyFor(ready, {
      dirty: true,
      keepaliveEligible: false,
    }))).toBe(true);
    expect(beforeUnloadWarningRequired(policyFor(ready, {
      dirty: true,
      pendingSaves: 1,
    }))).toBe(true);
    expect(beforeUnloadWarningRequired(policyFor(ready, {
      dirty: false,
      playModeActive: true,
    }))).toBe(false);
  });
});

function policyFor(
  session: SceneSyncSession,
  overrides: Partial<SceneExitSavePolicy> = {},
): SceneExitSavePolicy {
  return {
    loaded: true,
    dirty: true,
    playModeActive: false,
    pendingSaves: 0,
    keepaliveEligible: true,
    session,
    ...overrides,
  };
}
