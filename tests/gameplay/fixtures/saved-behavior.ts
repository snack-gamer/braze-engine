import type { BehaviorRegistration } from "../../../src/gameplay/public";

export type SavedBehaviorLife = {
  instance: number; name: string; owner: string; target: string | null; targetName: string | null;
  ticks: number; total: number; starts: number; enables: number; disables: number;
  disposed: string | null; cleanups: number; aborted: boolean; caption: string;
};
const lives: SavedBehaviorLife[] = [];
let nextInstance = 0;
Object.assign(window, { savedBehaviorProbe: { lives } });

/** Project-supplied code; the engine owns registration, persisted settings and lifetime. */
export const savedBehaviorRegistrations: readonly BehaviorRegistration[] = [{
  id: "review.counter", label: "Review Counter", version: 1,
  description: "Counts fixed ticks to demonstrate saved settings and automatic lifetime management.",
  fields: [
    { key: "amount", label: "Amount per tick", kind: "number", default: 1, min: 0, max: 20 },
    { key: "caption", label: "Caption", kind: "string", default: "Counter" },
    { key: "count", label: "Count ticks", kind: "boolean", default: true },
    { key: "target", label: "Target", kind: "entity", default: null },
  ],
  create(scope, values, context) {
    const target = scope.resolveEntity(values.target as { entityId: string } | null);
    const owner = context.world.inspect(scope.entity);
    const life: SavedBehaviorLife = {
      instance: ++nextInstance, name: owner.name, owner: `${scope.entity.slot}:${scope.entity.generation}`,
      target: target ? `${target.slot}:${target.generation}` : null,
      targetName: target ? context.world.inspect(target).name : null,
      ticks: 0, total: 0, starts: 0, enables: 0, disables: 0, disposed: null,
      cleanups: 0, aborted: false, caption: String(values.caption),
    };
    if (lives.length >= 256) lives.shift();
    lives.push(life);
    scope.defer(() => { life.cleanups++; life.aborted = scope.signal.aborted; });
    console.log(`[Saved behaviors] ${life.name}: created instance ${life.instance}; target ${life.targetName ?? "None"}.`);
    return {
      onEnable() { life.enables++; },
      start() { life.starts++; console.log(`[Saved behaviors] ${life.name}: started with amount ${values.amount}.`); },
      fixedUpdate() { life.ticks++; if (values.count) life.total += Number(values.amount); },
      onDisable() { life.disables++; },
      dispose(reason) { life.disposed = reason; console.log(`[Saved behaviors] ${life.name}: disposed (${reason}).`); },
    };
  },
}];
