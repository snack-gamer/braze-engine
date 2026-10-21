import { createThirdPersonControl, type EntityBehaviorAttachment, type EntityBatch, type EntityHandle,
  type GameContext, type GameModule, type PrefabBatch, type PrefabInstance, type PrefabPool } from "../../../src/gameplay/public";
import { mountStockControlsReviewPanel } from "./stock-controls-review-panel";

type CharacterLease = ReturnType<GameContext["characters"]["acquire"]>;
type CameraLease = ReturnType<GameContext["camera"]["acquire"]>;
const PREFAB = "bf150000000000000000000000000001";
const idleAction = Object.freeze({ value: 0, held: false, pressed: false, released: false });
const walkingAction = Object.freeze({ value: 1, held: true, pressed: false, released: false });

export const stockControlsProbe = {
  context: null as GameContext | null, hero: null as EntityHandle | null, pool: null as PrefabPool | null,
  actor: null as PrefabInstance | null, pending: null as PrefabBatch | null, removal: null as EntityBatch | null,
  old: null as EntityHandle | null, custom: null as EntityBehaviorAttachment | null,
  customCharacter: null as CharacterLease | null, customCamera: null as CameraLease | null,
  ticks: 0, creates: 0, disposes: 0, customCreates: 0, customDisposes: 0, customCleanups: 0,
  customWalking: false, conflictRequested: false, characterConflict: "", cameraConflict: "", bypassConflict: "", staleResult: "",
  message: "Press Play. Saved stock behavior supplies movement and camera; this module only observes it.",
  stock(handle?: EntityHandle) { return this.context!.behaviors.find(handle ?? this.hero!, "saved:stock"); },
  snapshot(handle?: EntityHandle) { return this.context!.characters.snapshot(handle ?? this.hero!); },
  report(message: string) { this.message = message; console.info(`[Stock controls] ${message}`); },
  enableStock(value: boolean) { this.stock()!.setEnabled(value); },
  tryConflicts() {
    try { this.context!.characters.acquire(this.hero!, "Conflicting review motor").release(); this.characterConflict = "accepted"; }
    catch (error) { this.characterConflict = String(error); }
    try { this.context!.camera.acquire("Conflicting review camera").release(); this.cameraConflict = "accepted"; }
    catch (error) { this.cameraConflict = String(error); }
    this.conflictRequested = true;
  },
  attachCustom() {
    if (this.custom && !["disposed", "failed"].includes(this.custom.read().status)) throw new Error("Detach the custom controller before replacing it.");
    const probe = this, context = this.context!;
    this.custom = context.behaviors.attach(this.hero!, { name: "Review custom controller", create(scope) {
      const character = context.characters.acquire(scope.entity, "Review custom motor");
      scope.defer(() => { character.release(); probe.customCharacter = null; probe.customCleanups++; });
      const camera = context.camera.acquire("Review custom camera");
      scope.defer(() => { camera.release(); probe.customCamera = null; });
      const policy = createThirdPersonControl({ movement: character, camera,
        input: { bindings: context.input.bindings, action(name) {
          return name === "moveX" && probe.customWalking ? walkingAction : idleAction;
        } },
      }, { locomotion: { speed: 2, gravity: 9.81, jumpSpeed: 4 }, camera: { fov: 55, sharpness: 0 } }, context.camera.constrain);
      probe.customCharacter = character; probe.customCamera = camera; probe.customCreates++;
      return { fixedUpdate(tick) { policy.step(tick.deltaSeconds); }, dispose() {
        // Reset before the deferred lease release. Stop/removal already revoked
        // its command ports, so those terminal paths discard the owned policy.
        if (!context.signal.aborted && context.world.isAlive(scope.entity)) policy.reset();
        probe.customDisposes++;
      } };
    } });
    this.report("Custom replacement queued through the public behavior and character/camera lease APIs.");
  },
  detachCustom() { this.custom!.detach(); this.customWalking = false; },
  acquirePooled() {
    if (this.actor || this.pending || this.removal) throw new Error("Return the current pooled character first.");
    this.pending = this.pool!.acquire({ position: [-1.2, 0.85, 0], rotation: [0, 0, 0] });
  },
  returnPooled() {
    if (!this.actor || this.pending || this.removal) throw new Error("Acquire a live pooled character first.");
    this.old = this.actor.entities.character; this.removal = this.pool!.release(this.actor);
  },
  inspectOld() {
    try { this.context!.characters.snapshot(this.old!); this.staleResult = "accepted"; }
    catch (error) { this.staleResult = (error as { code?: string }).code ?? String(error); }
  },
  rebindLookRate() { this.context!.input.rebind("lookRateX", [{ device: "keyboard", code: "KeyL" }]); },
};
declare global { interface Window { stockControlsProbe: typeof stockControlsProbe } }
window.stockControlsProbe = stockControlsProbe;
mountStockControlsReviewPanel(() => stockControlsProbe);

const game: GameModule = { version: 1, create(context) {
  const probe = stockControlsProbe;
  Object.assign(probe, { context, hero: context.world.findByAuthoredId("hero")!, pool: context.prefabs.createPool({ guid: PREFAB, localId: "main" }, { capacity: 1 }),
    actor: null, pending: null, removal: null, old: null, custom: null, customCharacter: null, customCamera: null,
    ticks: 0, customCreates: 0, customDisposes: 0, customCleanups: 0, customWalking: false, conflictRequested: false,
    characterConflict: "", cameraConflict: "", bypassConflict: "", staleResult: "" });
  probe.creates++; probe.report("Stock saved behavior is active; this custom module observes its public command pose.");
  return { fixedUpdate(tick) {
    probe.ticks = tick.index;
    if (probe.conflictRequested) {
      probe.conflictRequested = false;
      try { context.characters.move(probe.hero!, [0, 0, 0]); probe.bypassConflict = "accepted"; }
      catch (error) { probe.bypassConflict = String(error); }
    }
    const created = probe.pending?.read();
    if (created?.status === "committed") { probe.actor = created.instance; probe.pending = null; probe.report("Pooled saved stock controller committed."); }
    else if (created?.status === "rejected") { probe.pending = null; probe.report(`Pool rejected: ${created.message}`); }
    const removed = probe.removal?.read();
    if (removed?.status === "committed") { probe.actor = null; probe.removal = null; probe.report("Returned: motor, camera and gesture ownership released."); }
    else if (removed?.status === "rejected") { probe.removal = null; probe.report(`Return rejected: ${removed.message}`); }
  }, dispose() { probe.disposes++; probe.report("Stopped: stock/custom ownership and pooled runtime entities released."); } };
} };
export default game;
