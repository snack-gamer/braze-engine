import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import type { Group, Object3D } from "three";
import { createAnimatorPlaybackCommandPort } from "../../application/playback/animator-playback-commands";
import type { AnimatorPlaybackEvent, AnimatorPlaybackFrame } from "../../application/playback/animator-playback-contracts";
import type { AnimatorIkGoalStore } from "../../application/playback/animator-playback-ik";
import type { AnimatorRootMotionStore } from "../../application/playback/animator-root-motion-port";
import { hasCharacterRuntimeErrors, type CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import type { RootMotionSink } from "../../runtime/root-motion";
import { ThreeAnimatorDiagnosticLog } from "./three-animator-diagnostic-log";
import { createThreeAnimatorPoseBackend } from "./three-animator-pose-applier";
import { createThreeAnimatorPoseViews } from "./three-animator-pose-views";
import { createThreeAnimatorWorldAssets, type ThreeAnimatorWorldAssets, type ThreeAnimatorWorldRig } from "./three-animator-world-assets";
import type { ThreeAnimatorPlaybackCatalog } from "./three-animator-playback-resolver";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "./three-animator-playback-limits";
import { createThreeAnimatorWorldEntry, type ThreeAnimatorWorldEntry } from "./three-animator-world-entry";
import { createThreeAnimatorRuntimeTransactions } from "./three-animator-runtime-transactions";
import type { RuntimeAnimatorCreation } from "./three-animator-runtime-contracts";
import type { EntityHandle } from "../../../world/domain/entity-world";

type Input = Readonly<{
  objects: readonly SceneObject[];
  catalog: ThreeAnimatorPlaybackCatalog;
  fixedStepSeconds: number;
  ikStore: AnimatorIkGoalStore;
  rootMotionStore: AnimatorRootMotionStore;
  onEvent: (event: AnimatorPlaybackEvent) => void;
  onChange: (objectId: string) => void;
  onDiagnostics: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void;
  wake: () => void;
  physicsMotorFor: (objectId: string) => RootMotionSink | undefined;
  assets?: ThreeAnimatorWorldAssets;
  createPoseBackend?: typeof createThreeAnimatorPoseBackend;
}>;

/** One controller/event/root-motion cursor per entity for an entire Play lifetime. */
export class ThreeAnimatorWorldCoordinator {
  readonly commands;
  private readonly entries = new Map<string, ThreeAnimatorWorldEntry>();
  private readonly pending = new Set<string>();
  private readonly removed = new Set<string>();
  private readonly knownIds: ReadonlySet<string>;
  private readonly log: ThreeAnimatorDiagnosticLog;
  private readonly assets: ThreeAnimatorWorldAssets;
  private readonly views: ReturnType<typeof createThreeAnimatorPoseViews>;
  private readonly transactions: ReturnType<typeof createThreeAnimatorRuntimeTransactions>;
  private readonly released = new WeakSet<ThreeAnimatorWorldEntry>();
  private disposed = false;

  constructor(private readonly input: Input) {
    this.log = new ThreeAnimatorDiagnosticLog(input.onDiagnostics);
    this.views = createThreeAnimatorPoseViews((diagnostics, id) => this.log.record(diagnostics, id));
    const playable = input.objects.filter((object) => object.animator?.enabled);
    const selected = playable.slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumLiveSessions);
    this.knownIds = new Set(selected.map((object) => object.id));
    this.assets = input.assets ?? createThreeAnimatorWorldAssets(selected, input.catalog, input.objects);
    this.transactions = createThreeAnimatorRuntimeTransactions({
      entries: this.entries, authoredIds: new Set(input.objects.map((object) => object.id)), pendingCount: () => this.pending.size,
      create: ({ object, rig, entity, rootMotionSink }) => {
        const entry = this.createEntry(structuredClone(object), rig, "runtime", rootMotionSink);
        if (entity) entry.entity = Object.freeze({ ...entity });
        return entry;
      },
      show: (entry) => this.views.add(entry.object, entry.rig, entry.application, "runtime"),
      suspend: (id) => this.views.suspend(id), resume: (id) => this.views.resume(id), hide: (id) => this.views.remove(id),
      release: (entry) => this.releaseEntry(entry), releaseRig: ({ rig }) => this.cleanup(() => rig.dispose()),
      changed: (id) => { input.onChange(id); input.wake(); },
    });
    this.commands = createAnimatorPlaybackCommandPort((id) => this.entries.get(id)?.session, (id, result) => {
      this.log.record(result.diagnostics, id);
      if (result.value === null) return;
      this.views.present(id); input.onChange(id); input.wake();
    });
    if (playable.length > selected.length) this.log.record([{ code: "animator-world-session-capacity", severity: "error", message: `The animation world supports ${selected.length} live characters; ${playable.length - selected.length} were not started.` }]);
    if (selected.length) this.log.record([{ code: "three-animator-world-compatibility-budget", severity: "info", message: "Gameplay animation uses one world-owned state per character, with a bounded CPU pose backend (32 characters, 128 cached actions per pose target)." }]);
    for (const object of selected) void this.load(object);
  }

  attachView(runtime: Runtime) { return this.views.attachView(runtime); }
  attachRuntimeView(id: string, runtime: Runtime, node: Group, body: Object3D) {
    if (this.disposed) throw new Error("The animation world has ended.");
    return this.views.attachRuntimeView(id, runtime, node, body);
  }
  prepareRuntimeChange(created: readonly RuntimeAnimatorCreation[], removedIds: readonly string[]) { return this.transactions.prepare(created, removedIds); }
  runtimeAnimatorId(entity: EntityHandle) { return this.transactions.runtimeAnimatorId(entity); }
  runtimeEntity(id: string) { return this.transactions.runtimeEntity(id); }
  reservedSessionCount() { return this.transactions.reservedCount(); }
  hasViews() { return this.views.hasViews(); }
  liveSessionCount() { return this.entries.size; }
  pendingCount() { return this.pending.size; }
  diagnostics() { return this.log.snapshot(); }
  runtimeState(id: string) { return this.entries.get(id)?.session.runtimeStateSnapshot() ?? null; }
  runtimeController(id: string) { return this.entries.get(id)?.session.runtimeControllerDefinition() ?? null; }
  requiresContinuousFrames(timeScale: number) {
    for (const { session } of this.entries.values()) if (timeScale > 0 || session.usesUnscaledTime) return true;
    return false;
  }

  advance(frame: AnimatorPlaybackFrame, mode: "frame" | "fixed" | "all" = "all") {
    if (this.disposed) return;
    for (const [id, entry] of this.entries) {
      const fixed = entry.object.animator!.updateMode === "fixedStep";
      if (mode === "fixed" && !fixed || mode === "frame" && fixed) continue;
      try {
        const step = entry.session.advance(frame);
        this.log.record(step.diagnostics, id);
        if (hasCharacterRuntimeErrors(step.diagnostics)) this.remove(id);
        else if (this.entries.get(id) === entry) { if (step.changed) this.views.present(id); this.input.onChange(id); }
      } catch (error) {
        this.log.record([{ code: "animator-session-advance-failed", severity: "error", message: `Animator ${id} stopped: ${String(error)}` }], id);
        this.remove(id);
      }
    }
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (entry?.kind !== "runtime") {
      if (!this.knownIds.has(id) || this.removed.has(id)) return;
      this.removed.add(id); this.pending.delete(id);
    }
    this.entries.delete(id);
    this.views.remove(id);
    if (entry) {
      this.transactions.removed(entry); this.releaseEntry(entry);
    } else {
      this.input.ikStore.commands.clearCharacter(id); this.input.rootMotionStore.clearCharacter(id);
    }
    this.input.onChange(id);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.transactions.dispose();
    for (const id of this.entries.keys()) this.remove(id);
    this.pending.clear(); this.views.dispose(); this.cleanup(() => this.assets.dispose());
  }

  private cleanup(action: () => void, id?: string) {
    try { action(); } catch (error) { this.log.record([{ code: "animator-world-cleanup-failed", severity: "error", message: String(error) }], id); }
  }

  private releaseEntry(entry: ThreeAnimatorWorldEntry) {
    if (this.released.has(entry)) return;
    this.released.add(entry);
    const id = entry.object.id;
    this.input.ikStore.commands.clearCharacter(id); this.input.rootMotionStore.clearCharacter(id);
    try { entry.session.dispose(); } catch (error) { this.log.record([{ code: "animator-session-cleanup-failed", severity: "error", message: String(error) }], id); }
    finally { this.cleanup(() => entry.rig.dispose(), id); }
  }

  private createEntry(object: SceneObject, rig: ThreeAnimatorWorldRig, kind: ThreeAnimatorWorldEntry["kind"], runtimeRootMotionSink?: RootMotionSink) {
    return createThreeAnimatorWorldEntry(object, rig, kind, {
      ...this.input, runtimeRootMotionSink, report: (diagnostics, id) => this.log.record(diagnostics, id),
      isVisible: (id) => this.views.isVisible(id), capture: (id, application) => this.views.capture(id, application),
    });
  }

  private async load(object: SceneObject) {
    this.pending.add(object.id);
    let rig: ThreeAnimatorWorldRig | null = null;
    try {
      const result = await this.assets.load(object);
      rig = result.value;
      if (this.disposed || this.removed.has(object.id)) return;
      this.log.record(result.diagnostics, object.id);
      if (!rig || hasCharacterRuntimeErrors(result.diagnostics)) return;
      const entry = this.createEntry(object, rig, "authored");
      this.entries.set(object.id, entry); rig = null;
      this.views.add(object, entry.rig, entry.application);
      this.views.present(object.id); this.input.onChange(object.id); this.input.wake();
    } catch (error) {
      if (!this.disposed && !this.removed.has(object.id)) this.log.record([{ code: "animator-world-load-failed", severity: "error", message: `Animator ${object.name}: ${String(error)}` }], object.id);
    } finally {
      this.pending.delete(object.id);
      if (rig) { this.views.remove(object.id); const failed = rig; this.cleanup(() => failed.dispose(), object.id); }
    }
  }
}
