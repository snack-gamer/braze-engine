import type { EntityHandle, EntityWorld } from "../../world/domain/entity-world";
import { ENTITY_BEHAVIOR_LIMITS, EntityBehaviorError, type EntityBehaviorAttachment, type EntityBehaviorDefinition,
  type EntityBehaviorDiagnostic, type EntityBehaviorDisposeReason, type EntityBehaviorPhase, type EntityBehaviors,
  type EntityBehaviorState, type EntityBehaviorTick } from "../domain/entity-behaviors";
import { createBehaviorResources } from "./behavior-resources";

type Entry = {
  entity: EntityHandle; name: string; owner: string; initialEnabled: boolean;
  state: EntityBehaviorState;
  receipt?: EntityBehaviorAttachment;
  factory?: EntityBehaviorDefinition["create"];
  resources?: ReturnType<typeof createBehaviorResources>;
};
type Command = Readonly<{ kind: "attach"; entry: Entry }> | Readonly<{ kind: "detach"; entry: Entry }> | Readonly<{ kind: "enable"; entry: Entry; value: boolean }>;
type Options = Readonly<{ world: EntityWorld; report: (diagnostic: EntityBehaviorDiagnostic) => void; capacity?: number }>;
const terminal = (entry: Entry) => entry.state.status === "disposed" || entry.state.status === "failed";
const endedError = () => new EntityBehaviorError("world-ended", "This behavior world has ended.");

/** Bounded attachment lifetime; the empty path never scans entities or allocates a work list. */
export function createEntityBehaviors(options: Options) {
  const capacity = options.capacity ?? ENTITY_BEHAVIOR_LIMITS.attachments;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > ENTITY_BEHAVIOR_LIMITS.attachments) throw new EntityBehaviorError("capacity", "Behavior capacity must be between 1 and 256.");
  const entries = new Set<Entry>(), enabled = new Set<Entry>(), owners = new Map<string, Map<string, Entry>>();
  let admissions: Command[] | undefined;
  let queue: Command[] = [], ended = false, phase: "idle" | "begin" | "fixed" = "idle";
  let currentTick: EntityBehaviorTick | undefined, updatedTick = 0;
  const active = () => { if (ended || options.world.stats().ended) throw endedError(); };
  const publish = (entry: Entry, change: Partial<EntityBehaviorState>) => { entry.state = Object.freeze({ ...entry.state, ...change }); };
  const request = (command: Command) => {
    active();
    if (terminal(command.entry)) throw new EntityBehaviorError("stale-attachment", "This behavior attachment has ended.");
    options.world.inspect(command.entry.entity);
    if (queue.length >= ENTITY_BEHAVIOR_LIMITS.queuedCommands) throw new EntityBehaviorError("capacity", "Behavior command queue capacity exceeded (256).");
    queue.push(command);
  };
  const release = (entry: Entry, reason: EntityBehaviorDisposeReason, message?: string) => {
    if (terminal(entry)) return;
    const wasEnabled = enabled.delete(entry), resources = entry.resources;
    publish(entry, { status: reason === "failed" ? "failed" : "disposed", enabled: false, reason, message });
    entries.delete(entry);
    const siblings = owners.get(entry.owner); siblings?.delete(entry.name);
    if (!siblings?.size) owners.delete(entry.owner);
    entry.factory = undefined; entry.resources = undefined; entry.receipt = undefined;
    if (wasEnabled) {
      try { resources?.invoke("onDisable"); } catch (error) { resources?.diagnostic("onDisable", error); }
    }
    resources?.dispose(reason);
  };
  const fail = (entry: Entry, callback: EntityBehaviorPhase, error: unknown) => {
    const resources = entry.resources;
    release(entry, "failed", error instanceof Error ? error.message : String(error));
    resources?.diagnostic(callback, error);
  };
  const invoke = (entry: Entry, callback: "onEnable" | "start" | "fixedUpdate" | "onDisable", tick?: EntityBehaviorTick) => {
    try { entry.resources?.invoke(callback, tick); return !terminal(entry); }
    catch (error) { fail(entry, callback, error); return false; }
  };
  const setEnabled = (entry: Entry, value: boolean) => {
    if (terminal(entry) || entry.state.enabled === value) return;
    if (value) {
      enabled.add(entry); publish(entry, { status: "active", enabled: true });
      if (!invoke(entry, "onEnable")) return;
      if (!entry.state.started) {
        publish(entry, { started: true }); invoke(entry, "start");
      }
    } else {
      enabled.delete(entry); publish(entry, { status: "disabled", enabled: false }); invoke(entry, "onDisable");
    }
  };
  const initialize = (entry: Entry) => {
    if (terminal(entry)) return;
    const factory = entry.factory!; entry.factory = undefined;
    try { entry.resources!.create(factory); }
    catch (error) { fail(entry, "create", error); return; }
    if (terminal(entry)) return;
    publish(entry, { status: "disabled" });
    if (entry.initialEnabled) setEnabled(entry, true);
  };
  const port: EntityBehaviors = Object.freeze({
    attach(entity: EntityHandle, definition: EntityBehaviorDefinition, settings?: Readonly<{ enabled?: boolean }>): EntityBehaviorAttachment {
      active();
      const captured = options.world.inspect(entity).handle;
      if (!definition || typeof definition.name !== "string" || !definition.name.trim() || definition.name.length > 128 || typeof definition.create !== "function") throw new EntityBehaviorError("invalid-behavior", "Behavior definitions require a name (1–128 characters) and a create function.");
      if (settings?.enabled !== undefined && typeof settings.enabled !== "boolean") throw new EntityBehaviorError("invalid-behavior", "Behavior enabled must be a boolean.");
      if (entries.size >= capacity || queue.length + (admissions?.length ?? 0) >= ENTITY_BEHAVIOR_LIMITS.queuedCommands) throw new EntityBehaviorError("capacity", "Behavior attachment or command capacity reached.");
      const owner = `${captured.slot}:${captured.generation}`, siblings = owners.get(owner) ?? new Map<string, Entry>();
      if (siblings.has(definition.name)) throw new EntityBehaviorError("invalid-behavior", `Behavior '${definition.name}' is already attached to this entity.`);
      if (siblings.size >= ENTITY_BEHAVIOR_LIMITS.perEntity) throw new EntityBehaviorError("capacity", "An entity supports at most eight behavior attachments.");
      const entry: Entry = { entity: captured, name: definition.name, owner, initialEnabled: settings?.enabled !== false,
        factory: definition.create, state: Object.freeze({ status: "queued", enabled: false, started: false }),
        resources: createBehaviorResources(captured, definition.name, options.report) };
      entries.add(entry); siblings.set(entry.name, entry); owners.set(owner, siblings); (admissions ?? queue).push({ kind: "attach", entry });
      const receipt = Object.freeze({ entity: captured, name: entry.name, read: () => entry.state,
        setEnabled(value: boolean) {
          if (typeof value !== "boolean") throw new EntityBehaviorError("invalid-behavior", "Behavior enabled must be a boolean.");
          request({ kind: "enable", entry, value });
        }, detach: () => request({ kind: "detach", entry }) });
      entry.receipt = receipt; return receipt;
    },
    find(entity: EntityHandle, name: string) {
      active();
      const captured = options.world.inspect(entity).handle;
      if (typeof name !== "string" || !name.trim() || name.length > 128) throw new EntityBehaviorError("invalid-behavior", "Behavior lookup requires a name (1–128 characters).");
      return owners.get(`${captured.slot}:${captured.generation}`)?.get(name)?.receipt;
    },
    stats: () => Object.freeze({ attached: entries.size, pending: queue.length, enabled: enabled.size, capacity, ended }),
  });
  return {
    port,
    beginTick(tick: EntityBehaviorTick, admitSaved?: () => void) {
      active();
      if (phase !== "idle" || !Number.isSafeInteger(tick.index) || tick.index <= (currentTick?.index ?? 0)
        || !Number.isFinite(tick.deltaSeconds) || tick.deltaSeconds <= 0 || !Number.isFinite(tick.elapsedSeconds) || tick.elapsedSeconds < 0) throw new EntityBehaviorError("invalid-behavior", "Behavior ticks must be finite, increasing and non-reentrant.");
      currentTick = Object.freeze({ index: tick.index, deltaSeconds: tick.deltaSeconds, elapsedSeconds: tick.elapsedSeconds });
      // Snapshot BEFORE removal callbacks. Work they enqueue belongs to the next boundary.
      let batch = queue.length ? queue : undefined; if (batch) queue = [];
      phase = "begin";
      try {
        for (const entry of entries) if (!options.world.isAlive(entry.entity)) release(entry, "entity-removed");
        // Engine admissions use capacity freed by removals. Cleanup-created requests stay in next tick's queue.
        if (admitSaved) {
          admissions = [];
          try { admitSaved(); batch = batch ? batch.concat(admissions) : admissions; }
          finally { admissions = undefined; }
        }
        if (batch) for (const command of batch) {
          if (ended) break;
          const entry = command.entry; if (terminal(entry)) continue;
          if (command.kind === "attach") initialize(entry);
          else if (command.kind === "detach") release(entry, "detached");
          else setEnabled(entry, command.value);
        }
      } finally { if (batch) batch.length = 0; phase = "idle"; }
    },
    fixedUpdate(tick: EntityBehaviorTick) {
      active();
      if (phase !== "idle" || tick.index !== currentTick?.index || tick.index === updatedTick
        || tick.deltaSeconds !== currentTick.deltaSeconds || tick.elapsedSeconds !== currentTick.elapsedSeconds) throw new EntityBehaviorError("invalid-behavior", "Behavior fixedUpdate requires its admitted beginTick exactly once.");
      updatedTick = tick.index; phase = "fixed";
      try { for (const entry of enabled) { if (ended) break; invoke(entry, "fixedUpdate", currentTick); } }
      finally { phase = "idle"; }
    },
    dispose() {
      if (ended) return;
      ended = true; queue.length = 0;
      for (const entry of entries) release(entry, "world-ended");
      owners.clear(); enabled.clear();
    },
  };
}
