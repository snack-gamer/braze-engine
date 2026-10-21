import { createCharacterLocomotion, type EntityBatch, type EntityHandle, type GameCharacterResult, type GameContext, type GameModule, type PrefabBatch, type PrefabInstance, type PrefabPool } from "../../../src/gameplay/public";
import { mountRuntimeCharacterReviewPanel } from "./runtime-character-review-panel";

const PLAIN = "bf140000000000000000000000000001", SKIN = "bf140000000000000000000000000002";
type Actor = { instance: PrefabInstance; pooled: boolean; animated: boolean };
type Motor = { handle: EntityHandle; x: number; z: number; jump: boolean; ticks: number; result: GameCharacterResult | null;
  initial: GameCharacterResult | null; maxY: number; speed: number; stopped: boolean };
const key = (handle: EntityHandle) => `${handle.slot}:${handle.generation}`;

export const runtimeCharacterProbe = {
  context: null as GameContext | null, pool: null as PrefabPool | null, actors: [] as Actor[], motors: new Map<string, Motor>(),
  pending: null as { ticket: PrefabBatch; pooled: boolean; animated: boolean } | null,
  removal: null as { ticket: EntityBatch; actor: Actor } | null,
  old: null as EntityHandle | null, staleRequested: false, staleResult: "none", ticks: 0, creates: 0, disposes: 0,
  behaviorCreates: 0, behaviorDisposes: 0, cleanups: 0, message: "Press Play, then spawn two characters.",
  handle(index: number) { return this.actors[index]?.instance.entities.character; },
  state(index: number) { const handle = this.handle(index); return handle ? this.motors.get(key(handle)) : undefined; },
  report(message: string) { this.message = message; console.info(`[Runtime characters] ${message}`); },
  spawn(pooled: boolean, animated = false) {
    if (!this.context || this.context.signal.aborted) throw new Error("Enter Play first.");
    if (this.pending || this.removal || this.actors.length >= 2) throw new Error("Wait for the command or remove an actor; this review displays two characters.");
    if (pooled && animated) throw new Error("This pool owns the plain saved character.");
    const placement = { position: [-1.2, animated ? 0.15 : 0.85, this.actors.length ? 1 : -1] as const };
    const asset = this.context.prefabs.list().find((entry) => entry.asset.guid === (animated ? SKIN : PLAIN))!.asset;
    this.pending = { ticket: pooled ? this.pool!.acquire(placement) : this.context.prefabs.instantiate(asset, placement), pooled, animated };
    this.report("Character creation queued.");
  },
  move(index: number, x: number, z: number) { const motor = this.state(index); if (!motor) throw new Error("Spawn that character first."); motor.x = x; motor.z = z; },
  jump(index: number) { const motor = this.state(index); if (!motor) throw new Error("Spawn that character first."); motor.jump = true; },
  holdSkin() { const index = this.actors.findIndex((actor) => actor.animated); if (index < 0) throw new Error("Spawn the root-motion character first."); this.context!.animation.setBool(this.handle(index)!, "active", false); },
  remove() {
    const actor = this.actors[this.actors.length - 1];
    if (!actor || this.pending || this.removal) throw new Error("Choose a live actor with no pending structural command.");
    this.old = actor.instance.entities.character;
    this.removal = { actor, ticket: actor.pooled ? this.pool!.release(actor.instance) : this.context!.prefabs.destroy(actor.instance) };
    this.report("Character removal queued.");
  },
};
declare global { interface Window { runtimeCharacterProbe: typeof runtimeCharacterProbe } }
window.runtimeCharacterProbe = runtimeCharacterProbe;
mountRuntimeCharacterReviewPanel(() => runtimeCharacterProbe);

const game: GameModule = {
  version: 1,
  behaviors: [{ id: "review.runtime-character-locomotion", label: "Runtime character locomotion", version: 1,
    fields: [{ key: "speed", label: "Speed", kind: "number", default: 3, min: 0, max: 10 },
      { key: "gravity", label: "Gravity", kind: "number", default: 9.81, min: 0, max: 30 },
      { key: "jumpSpeed", label: "Jump speed", kind: "number", default: 5, min: 0, max: 10 }],
    create(scope, values, context) {
      const probe = runtimeCharacterProbe, speed = Number(values.speed);
      const motor: Motor = { handle: scope.entity, x: 0, z: 0, jump: false, ticks: 0, result: null, initial: null, maxY: -Infinity, speed, stopped: false };
      probe.motors.set(key(scope.entity), motor); probe.behaviorCreates++;
      const motion = createCharacterLocomotion((delta) => context.characters.move(scope.entity, delta), { speed, gravity: Number(values.gravity), jumpSpeed: Number(values.jumpSpeed) });
      scope.defer(() => { probe.cleanups++; motion.reset(); probe.motors.delete(key(scope.entity)); });
      return { fixedUpdate(tick) {
        const result = motion.step({ x: motor.x, z: motor.z, jump: motor.jump }, tick.deltaSeconds);
        motor.jump = false; motor.result = result; motor.initial ??= result; motor.maxY = Math.max(motor.maxY, result.position[1]); motor.ticks++;
      }, dispose() { motor.stopped = true; probe.behaviorDisposes++; } };
    },
  }],
  create(context) {
    const probe = runtimeCharacterProbe; probe.creates++;
    Object.assign(probe, { context, pool: context.prefabs.createPool({ guid: PLAIN, localId: "main" }, { capacity: 1 }), actors: [], pending: null, removal: null,
      old: null, staleRequested: false, staleResult: "none", ticks: 0, behaviorCreates: 0, behaviorDisposes: 0, cleanups: 0 });
    probe.motors.clear();
    context.camera.setPose({ position: [0, 5, 10], target: [0, 0.9, 0], fov: 55 });
    probe.report("Ready: no authored characters. Spawn independent runtime motors, then walk, jump, return and reacquire.");
    return { fixedUpdate(tick) {
      probe.ticks = tick.index;
      const pending = probe.pending, state = pending?.ticket.read();
      if (pending && state?.status === "committed") { probe.actors.push({ instance: state.instance, pooled: pending.pooled, animated: pending.animated }); probe.pending = null; probe.report(`Character committed at tick ${state.tick}.`); }
      else if (state?.status === "rejected") { probe.pending = null; probe.report(`Creation rejected: ${state.code}: ${state.message}`); }
      const removal = probe.removal, removed = removal?.ticket.read();
      if (removal && removed?.status === "committed") { probe.actors = probe.actors.filter((actor) => actor !== removal.actor); probe.removal = null; probe.report("Removal committed; old handle is stale."); }
      else if (removed?.status === "rejected") { probe.removal = null; probe.report(`Removal rejected: ${removed.code}: ${removed.message}`); }
      if (probe.staleRequested) {
        probe.staleRequested = false;
        try { context.characters.move(probe.old!, [0, 0, 0]); probe.staleResult = "accepted"; }
        catch (error) { probe.staleResult = (error as { code?: string }).code ?? String(error); }
        probe.report(`Old character handle: ${probe.staleResult}.`);
      }
    }, dispose() { probe.disposes++; probe.report("Stopped: motors, saved behaviors, model views and runtime characters released."); } };
  },
};
export default game;
