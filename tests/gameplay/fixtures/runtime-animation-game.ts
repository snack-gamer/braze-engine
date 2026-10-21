import type { EntityBatch, EntityHandle, GameAnimationSnapshot, GameContext, GameModule, PrefabBatch, PrefabInstance, PrefabPool } from "../../../src/gameplay/public";
import { mountRuntimeAnimationReviewPanel } from "./runtime-animation-review-panel";

type Instance = { instance: PrefabInstance; pooled: boolean; initial: GameAnimationSnapshot | null; label: string };
const entityKey = (entity: EntityHandle) => `${entity.slot}:${entity.generation}`;
export const runtimeAnimationProbe = {
  context: null as GameContext | null, pool: null as PrefabPool | null, instances: [] as Instance[],
  pending: null as { ticket: PrefabBatch; pooled: boolean } | null,
  removal: null as { ticket: EntityBatch; entry: Instance } | null,
  last: null as Instance | null, ticks: 0, serial: 0, events: {} as Record<string, number>,
  lastEventTicks: new Map<string, number>(), duplicates: 0, message: "Press Play, then Spawn skin twice.",
  handle(index: number) { return this.instances[index]?.instance.entities["Animated Skin"]; },
  snapshot(index: number) {
    const handle = this.handle(index);
    return handle && this.context && !this.context.signal.aborted ? this.context.animation.snapshot(handle) : null;
  },
  eventCount(index: number) { const handle = this.handle(index); return handle ? this.events[entityKey(handle)] ?? 0 : 0; },
  report(message: string) { this.message = message; console.info(`[Runtime animation] ${message}`); },
  spawn(pooled: boolean) {
    if (!this.context || this.context.signal.aborted) throw new Error("Enter Play first.");
    if (this.pending || this.removal) throw new Error("Wait for the pending structural command.");
    if (this.instances.length >= 2) throw new Error("Remove an instance first; this review displays two skins.");
    const placement = { position: [this.instances.length ? 1.5 : -1.5, 0.15, 0] as const };
    this.pending = { pooled, ticket: pooled ? this.pool!.acquire(placement) : this.context.prefabs.instantiate(this.context.prefabs.list()[0].asset, placement) };
    this.report(pooled ? "Acquire queued." : "Spawn queued.");
  },
  remove() {
    const entry = this.instances[this.instances.length - 1];
    if (!entry || this.pending || this.removal) throw new Error("Choose a live instance with no pending command.");
    this.last = entry;
    this.removal = { entry, ticket: entry.pooled ? this.pool!.release(entry.instance) : this.context!.prefabs.destroy(entry.instance) };
    this.report(entry.pooled ? "Return queued." : "Destroy queued.");
  },
  setSpeed(index: number, value: number) { this.context!.animation.setFloat(this.handle(index)!, "speed", value); this.report(`Skin ${index + 1} speed = ${value}.`); },
  setActive(index: number, value: boolean) { this.context!.animation.setBool(this.handle(index)!, "active", value); this.report(`Skin ${index + 1}: ${value ? "Sway" : "Hold"} queued for the next animation tick.`); },
};
declare global { interface Window { runtimeAnimationProbe: typeof runtimeAnimationProbe } }
window.runtimeAnimationProbe = runtimeAnimationProbe;
mountRuntimeAnimationReviewPanel(() => runtimeAnimationProbe);

const game: GameModule = { version: 1, create(context) {
  const probe = runtimeAnimationProbe;
  Object.assign(probe, { context, pool: context.prefabs.createPool(context.prefabs.list()[0].asset, { capacity: 1 }),
    instances: [], pending: null, removal: null, last: null, ticks: 0, serial: 0, events: {}, duplicates: 0 });
  probe.lastEventTicks.clear();
  context.animation.subscribe((event) => {
    const key = entityKey(event.entity), occurrence = `${key}:${event.kind}:${event.event.id}`;
    probe.events[key] = (probe.events[key] ?? 0) + 1;
    if (probe.lastEventTicks.get(occurrence) === probe.ticks) probe.duplicates++;
    probe.lastEventTicks.set(occurrence, probe.ticks);
  });
  probe.report("World ready. Spawn two independent skins; change the first speed or hold its Behavior Map state.");
  return { fixedUpdate(tick) {
    probe.ticks = tick.index;
    const pending = probe.pending, state = pending?.ticket.read();
    if (pending && state?.status === "committed") {
      probe.instances.push({ instance: state.instance, pooled: pending.pooled, initial: null, label: `Skin ${++probe.serial}` });
      probe.pending = null; probe.report(`Spawn committed at tick ${state.tick}. Instances: ${probe.instances.length}.`);
    } else if (state?.status === "rejected") { probe.pending = null; probe.report(`Spawn rejected: ${state.code}: ${state.message}`); }
    for (let index = 0; index < probe.instances.length; index++) {
      const entry = probe.instances[index]; if (!entry.initial) entry.initial = probe.snapshot(index);
    }
    const removal = probe.removal, result = removal?.ticket.read();
    if (removal && result?.status === "committed") {
      const key = entityKey(removal.entry.instance.entities["Animated Skin"]);
      delete probe.events[key];
      for (const occurrence of probe.lastEventTicks.keys()) if (occurrence.startsWith(`${key}:`)) probe.lastEventTicks.delete(occurrence);
      probe.instances = probe.instances.filter((entry) => entry !== removal.entry); probe.removal = null;
      probe.report(`Removal committed at tick ${result.tick}. Old animation handles are stale.`);
    } else if (result?.status === "rejected") { probe.removal = null; probe.report(`Removal rejected: ${result.message}`); }
  }, dispose() { probe.report("Play stopped. Skins, animation sessions and event subscriptions released."); } };
} };
export default game;
