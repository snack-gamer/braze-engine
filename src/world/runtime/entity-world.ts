import { EntityWorldError, type EntityBatch, type EntityBatchState, type EntityCommand, type EntityWorld } from "../domain/entity-world";
import { copyEntityCommands, createComponentValidation, stageEntityChange, type EntityChangePlan, type EntityComponentCapability } from "./entity-change-plan";
import { createEntityReservations } from "./entity-reservations";
import { createEntitySlots } from "./entity-slots";
import { captureEntityTag } from "../domain/entity-tags";
import { captureAuthoredEntities, type AuthoredEntity } from "./authored-entities";

export type PreparedEntityChange = Readonly<{
  /** Synchronous, reversible publication. Must not await GPU work. */
  publish: () => void;
  /** Undo even a partially failed publish; release all staged resources. */
  rollback: () => void;
  /** Resolve only once removed resources are safe to reuse after in-flight work. */
  retire: () => void | Promise<void>;
}>;
export type EntityLifecycleBackend = Readonly<{
  components: readonly EntityComponentCapability[];
  supportsAuthoredRemoval?: boolean;
  releaseReservations?: (tokens: readonly symbol[]) => void;
  /** Failure must release partially prepared resources before rejecting. */
  prepare: (plan: EntityChangePlan, signal: AbortSignal) => PreparedEntityChange | Promise<PreparedEntityChange>;
  /** Owns all published resources, including those still alive at Stop. */
  dispose: () => void | Promise<void>;
}>;
type Options = Readonly<{
  capacity?: number;
  authored?: readonly AuthoredEntity[];
  backend?: EntityLifecycleBackend;
  tagCatalog?: readonly string[];
  report?: (error: EntityWorldError) => void;
  /** Engine-only observer after every node in a committed batch is live. Observer failure never rolls back publication. */
  onCommitted?: (created: EntityChangePlan["created"]) => void;
}>;
type PendingBatch = {
  commands: readonly EntityCommand[];
  state: EntityBatchState;
  bindings?: ReadonlyMap<string, symbol>;
  authorized?: ReadonlySet<symbol>;
  plan?: EntityChangePlan;
  prepared?: PreparedEntityChange;
};
const logicalChange: PreparedEntityChange = Object.freeze({ publish() {}, rollback() {}, retire() {} });
const ended = () => new EntityWorldError("world-ended", "This entity world has ended.");

/** One world, one bounded FIFO. Empty ticks are O(1); only changed entities are visited. */
export function createEntityWorld(options: Options = {}) {
  const tagNames = Object.freeze([...(options.tagCatalog ?? [])].map(captureEntityTag));
  const allowedTags = options.tagCatalog === undefined ? undefined : new Set(tagNames);
  const validateTags = (tags: readonly string[]) => {
    for (const tag of tags) if (allowedTags && !allowedTags.has(tag)) throw new EntityWorldError("invalid-command", `Tag '${tag}' is not defined in Project Tags.`);
  };
  const slots = createEntitySlots(options.capacity ?? 4096), abort = new AbortController();
  const validate = createComponentValidation(options.backend?.components ?? []);
  const queue: PendingBatch[] = [];
  let queuedCommands = 0, flushing = false, lastTick = 0;
  captureAuthoredEntities(slots, options.authored ?? [], validateTags);
  const report = (error: unknown) => {
    try { options.report?.(new EntityWorldError("backend-failed", error instanceof Error ? error.message : String(error))); }
    catch { /* Diagnostics cannot retain owned resources. */ }
  };
  const reject = (job: PendingBatch, error: unknown) => {
    job.state = Object.freeze({ status: "rejected", code: error instanceof EntityWorldError ? error.code : "backend-failed",
      message: error instanceof Error ? error.message : String(error) });
  };
  const rollback = (job: PendingBatch, prepared = job.prepared) => {
    let safe = true;
    job.prepared = undefined;
    try { prepared?.rollback(); } catch (error) { safe = false; report(error); }
    job.plan?.created.forEach(({ entity }) => slots.cancel(entity.handle, safe));
    // A backend that cannot undo partial publication is no longer a usable world.
    if (!safe) dispose();
  };
  const ready = (job: PendingBatch, prepared: PreparedEntityChange) => {
    if (abort.signal.aborted) { rollback(job, prepared); return; }
    job.prepared = prepared; job.state = Object.freeze({ status: "ready" });
  };
  const prepare = (job: PendingBatch) => {
    try {
      job.plan = stageEntityChange(slots, job.commands, validate, job.bindings, job.authorized, options.backend?.supportsAuthoredRemoval);
      job.state = Object.freeze({ status: "preparing" });
      const structural = job.plan.created.length > 0 || job.plan.removed.length > 0;
      const result = structural ? options.backend?.prepare(job.plan, abort.signal) ?? logicalChange : logicalChange;
      if ("then" in result) {
        void result.then((prepared) => ready(job, prepared)).catch((error) => {
          rollback(job);
          if (!abort.signal.aborted) reject(job, error);
        });
      } else ready(job, result);
    } catch (error) { rollback(job); reject(job, error); }
  };
  const retire = (job: PendingBatch) => {
    const removed = job.plan!.removed;
    const finish = (succeeded: boolean) => removed.forEach((entity) => slots.retire(entity.handle, succeeded));
    try {
      const retired = job.prepared!.retire();
      if (retired) void retired.then(() => finish(true), (error) => { finish(false); report(error); });
      else finish(true);
    } catch (error) { finish(false); report(error); }
  };
  function dispose() {
    if (abort.signal.aborted) return;
    abort.abort();
    for (const job of queue) {
      if (job.prepared) rollback(job);
      reject(job, ended());
      job.commands = []; job.plan = undefined; job.bindings = undefined; job.authorized = undefined;
    }
    queue.length = 0; queuedCommands = 0; slots.dispose();
    try { const result = options.backend?.dispose(); if (result) void result.catch(report); }
    catch (error) { report(error); }
  }
  const submit = (commands: readonly EntityCommand[], authorized?: ReadonlySet<symbol>, bindings?: ReadonlyMap<string, symbol>): EntityBatch => {
    slots.active();
    if (!Array.isArray(commands)) throw new EntityWorldError("invalid-command", "Structural commands must be an array.");
    if (queue.length >= 64 || queuedCommands + commands.length > 256) throw new EntityWorldError("capacity", "Structural command queue is full (64 batches / 256 commands).");
    const captured = copyEntityCommands(commands);
    for (const command of captured) if (command.op === "create" || command.op === "setTags") validateTags(command.tags ?? []);
    const job: PendingBatch = { commands: captured, bindings: bindings ? new Map(bindings) : undefined, authorized, state: Object.freeze({ status: "queued" }) };
    queue.push(job); queuedCommands += captured.length;
    return Object.freeze({ read: () => job.state });
  };
  const reservations = createEntityReservations({ active: slots.active, state: slots.reservationState, submit,
    release(tokens) { options.backend?.releaseReservations?.(tokens); tokens.forEach(slots.releaseReservation); },
  });
  const port: EntityWorld = Object.freeze({
    tagNames,
    findByAuthoredId: slots.findByAuthoredId, isAlive: slots.isAlive, inspect: slots.inspect,
    queryTag: (tag: string, limit: number) => { slots.active(); validateTags([tag]); return slots.queryTag(tag, limit); },
    stats: () => Object.freeze({ ...slots.stats(), queuedCommands }),
    submit: (commands: readonly EntityCommand[]) => submit(commands),
    destroy: (handle: import("../domain/entity-world").EntityHandle) => submit([{ op: "destroySubtree", handle }]),
  });
  return {
    port, reservations,
    flush(tick: number) {
      slots.active();
      if (flushing || !Number.isSafeInteger(tick) || tick <= lastTick) throw new EntityWorldError("invalid-command", "Structural changes require a new, non-reentrant fixed tick.");
      lastTick = tick;
      const job = queue[0];
      if (!job) return;
      flushing = true;
      try {
        if (job.state.status === "queued") prepare(job);
        if (job.state.status === "ready") {
          try {
            job.prepared!.publish();
            if (abort.signal.aborted) throw ended();
          } catch (error) { rollback(job); reject(job, error); return; }
          const created = Object.create(null) as Record<string, import("../domain/entity-world").EntityHandle>;
          for (const item of job.plan!.created) { slots.publish(item.entity); created[item.key] = item.entity.handle; }
          for (const entity of job.plan!.removed) slots.remove(entity);
          for (const change of job.plan!.retagged ?? []) slots.updateTags(change.before, change.after);
          job.state = Object.freeze({ status: "committed", tick, created: Object.freeze(created), removed: job.plan!.removed.length });
          retire(job);
          try { options.onCommitted?.(job.plan!.created); } catch (error) { report(error); }
        }
      } finally {
        flushing = false;
        if (!abort.signal.aborted && (job.state.status === "committed" || job.state.status === "rejected")) {
          queue.shift(); queuedCommands -= job.commands.length;
          // Completed receipts retain their result only, not backend resources or input payloads.
          job.commands = []; job.bindings = undefined; job.authorized = undefined;
          job.prepared = undefined;
          job.plan = undefined;
        }
      }
    },
    dispose,
  };
}
