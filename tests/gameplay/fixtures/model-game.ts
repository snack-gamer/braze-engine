import type { GameModule, GameContext, PrefabInstance, PrefabBatch, EntityBatch, PrefabPool } from "../../../src/gameplay/public";
import { mountModelReviewPanel } from "./model-review-panel";
export const modelProbe = {
  context: null as GameContext | null, pool: null as PrefabPool | null,
  instances: [] as Array<{ instance: PrefabInstance; pooled: boolean }>,
  pending: null as { ticket: PrefabBatch; pooled: boolean } | null,
  removal: null as EntityBatch | null, last: null as PrefabInstance | null, ticks: 0, message: "Press Play, then Spawn pair or Acquire pair.",
  report(message: string) { this.message = message; console.info(`[Runtime models] ${message}`); },
  spawn(pooled: boolean) {
    if (!this.context || this.context.signal.aborted) throw new Error("Enter Play first.");
    if (this.pending) throw new Error("Wait for the pending spawn.");
    const placement = { position: [this.instances.length ? 0 : 0, 2, this.instances.length * -2] as const };
    const ticket = pooled ? this.pool!.acquire(placement) : this.context.prefabs.instantiate(this.context.prefabs.list()[0].asset, placement);
    this.pending = { ticket, pooled }; this.report("Spawn queued. Asset preparation must finish before the fixed-tick commit.");
  },
  remove() {
    const entry = this.instances.pop(); if (!entry) throw new Error("No instance to remove.");
    this.last = entry.instance;
    this.removal = entry.pooled ? this.pool!.release(entry.instance) : this.context!.prefabs.destroy(entry.instance);
    this.report(entry.pooled ? "Return queued." : "Destroy queued.");
  },
};
declare global { interface Window { modelProbe: typeof modelProbe } }
window.modelProbe = modelProbe;
mountModelReviewPanel(() => modelProbe);
const game: GameModule = { version: 1, create(context) {
  Object.assign(modelProbe, { context, pool: context.prefabs.createPool(context.prefabs.list()[0].asset, { capacity: 2 }), instances: [], pending: null, removal: null, last: null, ticks: 0 });
  modelProbe.report("World ready. Orange uses the imported texture; cyan uses the saved material. Cyan falls when physics is enabled.");
  return { fixedUpdate(tick) {
    modelProbe.ticks = tick.index;
    const pending = modelProbe.pending, state = pending?.ticket.read();
    if (state?.status === "committed" && pending) {
      modelProbe.instances.push({ instance: state.instance, pooled: pending.pooled }); modelProbe.pending = null;
      modelProbe.report(`Spawn committed at tick ${state.tick}. Both model nodes are active. Instances: ${modelProbe.instances.length}.`);
    } else if (state?.status === "rejected") { modelProbe.pending = null; modelProbe.report(`Spawn rejected: ${state.code}: ${state.message}`); }
    const removal = modelProbe.removal?.read();
    if (removal?.status === "committed" || removal?.status === "rejected") {
      modelProbe.removal = null; modelProbe.report(removal.status === "committed" ? `Removal committed at tick ${removal.tick}. Old handles are stale.` : `Removal rejected: ${removal.message}`);
    }
  }, dispose() { modelProbe.report("Stopped. Runtime instances and resources released; authored scene restored."); } };
} };
export default game;
