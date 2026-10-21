import { createRegisteredBehaviors, type AuthoredBehaviorSource, type CreatedBehaviorEntities } from "../../behaviors/runtime/registered-behaviors";
import { FixedStepClock, type FixedStepClockOptions } from "../../runtime/fixed-step-clock";
import type { GameContext, GameFrame, GameInstance, GameModule, GameplayDiagnostic, GameTick } from "../domain/game-module";
import { createGameEvents } from "./game-events";
import { createEntityBehaviors } from "../../behaviors/runtime/entity-behaviors";
import { createUiSession } from "../../game-ui/runtime/ui-session";
import type { UiDocument } from "../../game-ui/domain/ui-document";

export type GameSessionPorts = Readonly<{
  context: (signal: AbortSignal) => Omit<GameContext, "signal" | "events" | "defer" | "behaviors" | "ui">;
  authoredUi?: readonly Readonly<{ id: string; document: UiDocument }>[];
  beforeTick: (index: number) => void;
  authoredBehaviors?: readonly AuthoredBehaviorSource[];
  afterTick?: () => void;
  report: (diagnostic: GameplayDiagnostic) => void;
}>;

function synchronous(result: unknown): void {
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    void Promise.resolve(result).catch(() => undefined);
    throw new Error("Gameplay frame callbacks must be synchronous; start asynchronous work with the session abort signal.");
  }
}

/** One Play lifetime. No global registry, browser clock or authored mutation. */
export function createGameSession(module: GameModule, ports: GameSessionPorts, options: Partial<FixedStepClockOptions> = {}) {
  const clock = new FixedStepClock(options);
  const abort = new AbortController();
  const cleanups: Array<() => void> = [];
  const ui = createUiSession();
  const uiOwners = new Map<string, () => boolean>();
  let instance: GameInstance | null = null;
  let behaviors: ReturnType<typeof createEntityBehaviors> | null = null;
  let registered: ReturnType<typeof createRegisteredBehaviors> | null = null;
  let status: "starting" | "running" | "failed" | "disposed" = "starting";
  let disposedInstance = false, started = false, warnedDropped = false, released = false;
  let timing: "local" | "physics" | null = null, lastTickIndex = 0;
  const report = (code: GameplayDiagnostic["code"], error: unknown) => {
    try { ports.report({ code, message: error instanceof Error ? error.message : String(error) }); } catch { /* Observer failures do not retain resources. */ }
  };
  const cleanup = (callback: () => void) => {
    try { callback(); } catch (error) { report("gameplay-cleanup-failed", error); }
  };
  const release = () => {
    if (released) return;
    released = true;
    registered?.dispose();
    behaviors?.dispose();
    abort.abort();
    events.dispose();
    ui.dispose(); uiOwners.clear();
    if (instance && !disposedInstance) { disposedInstance = true; cleanup(() => instance!.dispose()); }
    while (cleanups.length) cleanup(cleanups.pop()!);
  };
  const fail = (code: GameplayDiagnostic["code"], error: unknown) => {
    if (status === "disposed" || status === "failed") return;
    status = "failed"; release(); report(code, error);
  };
  const events = createGameEvents((error) => fail("gameplay-update-failed", error));
  const tick = (index: number) => {
    if (status !== "running") return;
    try {
      ports.beforeTick(index);
      for (const [id, alive] of uiOwners) if (!alive()) { ui.port.screen(id)?.dispose(); uiOwners.delete(id); }
      ui.advance(clock.fixedTimestep);
      const tickValue = { index, deltaSeconds: clock.fixedTimestep, elapsedSeconds: index * clock.fixedTimestep };
      behaviors?.beginTick(tickValue, registered?.hasPending() ? registered.admit : undefined);
      events.flush();
      if (abort.signal.aborted) return;
      lastTickIndex = index;
      synchronous(instance?.fixedUpdate?.(tickValue));
      if (!abort.signal.aborted) behaviors?.fixedUpdate(tickValue);
    } finally { ports.afterTick?.(); }
  };
  const selectTiming = (next: "local" | "physics") => {
    if (timing && timing !== next) throw new Error("Gameplay cannot switch fixed-step clocks during Play; Stop and restart.");
    timing = next;
  };
  const update = (frame: GameFrame) => synchronous(instance?.update?.({
    deltaSeconds: Math.max(0, Math.min(Number.isFinite(frame.deltaSeconds) ? frame.deltaSeconds : 0, clock.maxFrameDelta)),
    interpolationAlpha: frame.interpolationAlpha,
  }));
  return {
    ui,
    status: () => status,
    activateCreated: (created: CreatedBehaviorEntities) => registered?.captureCreated(created),
    async start() {
      if (started || status !== "starting") return;
      started = true;
      try {
        if (module.version !== 1 || typeof module.create !== "function") throw new Error("A gameplay entry must default-export a version-1 GameModule.");
        const base = ports.context(abort.signal);
        for (const source of ports.authoredUi ?? []) {
          ui.port.create(source.id, source.document);
          const owner = base.world.findByAuthoredId(source.id);
          if (owner) uiOwners.set(source.id, () => base.world.isAlive(owner));
        }
        const reportBehavior = (behavior: import("../../behaviors/domain/entity-behaviors").EntityBehaviorDiagnostic) => ports.report({ code: "entity-behavior-failed", behavior,
          message: `${behavior.name} on #${behavior.entity.slot}:${behavior.entity.generation}, ${behavior.phase}: ${behavior.message}` });
        behaviors = createEntityBehaviors({ world: base.world, report: reportBehavior });
        const context: GameContext = Object.freeze({
          ...base, ui: ui.port, behaviors: behaviors.port, signal: abort.signal, events: events.port,
          defer(callback: () => void) {
            if (typeof callback !== "function") throw new Error("Gameplay cleanup must be a function.");
            if (abort.signal.aborted) cleanup(callback);
            else {
              if (cleanups.length >= 256) throw new Error("Gameplay cleanup capacity exceeded.");
              cleanups.push(callback);
            }
          },
        });
        registered = createRegisteredBehaviors(context, module.behaviors ?? [], reportBehavior);
        const created = await module.create(context);
        if (!created || typeof created.dispose !== "function") throw new Error("GameModule.create must return an instance with dispose().");
        if (abort.signal.aborted) { cleanup(() => created.dispose()); return; }
        instance = created;
        for (const method of [created.fixedUpdate, created.update]) {
          if (method !== undefined && typeof method !== "function") throw new Error("Gameplay update callbacks must be functions.");
        }
        registered.captureScene(ports.authoredBehaviors ?? []);
        status = "running";
      } catch (error) { fail("gameplay-start-failed", error); }
    },
    advance(deltaSeconds: number) {
      if (status !== "running") return;
      try {
        selectTiming("local");
        const batch = clock.advance(deltaSeconds);
        if (batch.droppedSeconds > 0 && !warnedDropped) {
          warnedDropped = true;
          report("gameplay-time-dropped", `Gameplay catch-up discarded ${batch.droppedSeconds.toFixed(3)} seconds; the fixed-step budget was reached.`);
        }
        for (let i = 0; i < batch.steps && !abort.signal.aborted; i += 1) tick(batch.firstStepId + i);
        if (!abort.signal.aborted) update({ deltaSeconds, interpolationAlpha: batch.interpolationAlpha });
      } catch (error) { fail("gameplay-update-failed", error); }
    },
    step() {
      if (status !== "running") return;
      try { selectTiming("local"); tick(clock.stepOnce().lastStepId); } catch (error) { fail("gameplay-update-failed", error); }
    },
    fixedTick(value: GameTick) {
      if (status !== "running") return false;
      try {
        selectTiming("physics");
        if (value.index !== lastTickIndex + 1 || value.deltaSeconds !== clock.fixedTimestep) {
          throw new Error("The physics timeline changed during gameplay; Stop and restart Play Mode.");
        }
        tick(value.index);
      } catch (error) { fail("gameplay-update-failed", error); }
      return !abort.signal.aborted;
    },
    updateFrame(frame: GameFrame) {
      if (status !== "running") return;
      try { selectTiming("physics"); update(frame); } catch (error) { fail("gameplay-update-failed", error); }
    },
    dispose() {
      if (status === "disposed") return;
      status = "disposed"; release();
    },
  };
}
