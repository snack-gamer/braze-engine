import type { GameContext } from "../../gameplay/domain/game-module";
import type { EntityHandle, WorldEntity } from "../../world/domain/entity-world";
import { captureBehaviorComponent, type BehaviorComponent } from "../domain/behavior-component";
import type { EntityBehaviorDiagnostic } from "../domain/entity-behaviors";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { resolveBehaviorValues, validateBehaviorRegistry } from "../domain/behavior-registry";

export type AuthoredBehaviorSource = Readonly<{ entityId: string; behaviors?: BehaviorComponent }>;
export type CreatedBehaviorEntities = readonly Readonly<{ key: string; entity: WorldEntity }>[];
type Pending = Readonly<{ entity: EntityHandle; component: BehaviorComponent; local?: ReadonlyMap<string, EntityHandle> }>;

/** Admission visits only captured scene components or committed batch changes, never the live world. */
export function createRegisteredBehaviors(context: GameContext, registrations: readonly BehaviorRegistration[], report: (diagnostic: EntityBehaviorDiagnostic) => void) {
  const registry = new Map(validateBehaviorRegistry(registrations).map((registration) => [registration.id, registration]));
  let pending: Pending[] = [], ended = false;
  const diagnostic = (entity: EntityHandle, name: string, error: unknown) => {
    try { report({ entity, name, phase: "create", message: error instanceof Error ? error.message : String(error) }); }
    catch { /* An observer cannot break sibling activation or retain the queue. */ }
  };
  const enqueue = (entity: EntityHandle, component: BehaviorComponent | undefined, local?: ReadonlyMap<string, EntityHandle>) => {
    if (ended || !component || (!component.unavailable && component.entries.length === 0)) return;
    if (pending.length >= 256) { diagnostic(entity, "Saved behaviors", "Saved behavior admission capacity exceeded (256 entities per tick)."); return; }
    // One structural commit per tick, plus the initial captured scene. No retained terminal history.
    pending.push({ entity, component: captureBehaviorComponent(component), local });
  };
  const attach = ({ entity, component, local }: Pending) => {
    if (!context.world.isAlive(entity)) return;
    if (component.unavailable) { diagnostic(entity, "Saved behaviors", component.unavailable.message); return; }
    for (const entry of component.entries) {
      try {
        context.behaviors.attach(entity, { name: `saved:${entry.id}`, create(scope) {
          const registration = registry.get(entry.type);
          if (!registration) throw new Error(`Behavior '${entry.type}' is unavailable. Register its stable type ID in game.ts.`);
          if (entry.typeVersion !== registration.version) throw new Error(`Behavior '${entry.type}' has saved version ${entry.typeVersion}, but its registration expects ${registration.version}. Update the saved component before Play.`);
          const values = resolveBehaviorValues(registration, entry.values);
          if (local) for (const field of registration.fields) {
            const value = values[field.key];
            if (field.kind === "entity" && value && typeof value === "object" && !local.has(value.entityId)) {
              throw new Error(`Behavior '${entry.type}' field '${field.key}' references '${value.entityId}' outside its prefab instance. Assign a node from the same saved prefab.`);
            }
          }
          return registration.create(Object.freeze({ ...scope, resolveEntity(reference: Readonly<{ entityId: string }> | null) {
            if (!reference || scope.signal.aborted) return undefined;
            const handle = local ? local.get(reference.entityId) : context.world.findByAuthoredId(reference.entityId);
            return handle && context.world.isAlive(handle) ? handle : undefined;
          } }), values, context);
        } }, { enabled: entry.enabled });
      } catch (error) { diagnostic(entity, `${entry.type} (${entry.id})`, error); }
    }
  };
  return {
    captureScene(sources: readonly AuthoredBehaviorSource[]) {
      for (const source of sources) {
        const entity = context.world.findByAuthoredId(source.entityId);
        if (entity) enqueue(entity, source.behaviors);
      }
    },
    captureCreated(created: CreatedBehaviorEntities) {
      if (ended || !created.some(({ entity }) => entity.behaviors !== undefined)) return;
      const local = new Map(created.map(({ key, entity }) => [key, entity.handle]));
      for (const { entity } of created) enqueue(entity.handle, entity.behaviors, local);
    },
    hasPending: () => pending.length > 0,
    admit() { const batch = pending; pending = []; for (const item of batch) attach(item); },
    dispose() { ended = true; pending.length = 0; registry.clear(); },
  };
}
