import { captureRuntimeModel, RUNTIME_MODEL_COMPONENTS } from "../domain/runtime-model";
import { captureBehaviorComponent } from "../../behaviors/domain/behavior-component";
import { EntityWorldError, type EntityCommand, type WorldEntity } from "../domain/entity-world";
import type { EntitySlots } from "./entity-slots";
import { captureRuntimePrimitive, RUNTIME_PRIMITIVE_COMPONENTS } from "../domain/runtime-primitive";
import { captureEntityTransform } from "../domain/entity-transform";
import { captureEntityTags } from "../domain/entity-tags";
import { expandEntityDestruction } from "./entity-destruction";
import { validateRuntimeModelAnimator } from "./runtime-model-animator-validation";
import { captureRuntimeCharacter, RUNTIME_CHARACTER_COMPONENTS } from "../../character-controller/domain/runtime-character";

/** Backend capability declarations, not a second authored component registry. */
export type EntityComponentCapability = Readonly<{ id: string; requires: readonly string[] }>;
export type EntityChangePlan = Readonly<{
  created: readonly Readonly<{ key: string; entity: WorldEntity }>[];
  removed: readonly WorldEntity[];
  reservations?: ReadonlyMap<WorldEntity["handle"], symbol>;
  retagged?: readonly Readonly<{ before: WorldEntity; after: WorldEntity }>[];
}>;

export function createComponentValidation(capabilities: readonly EntityComponentCapability[]) {
  const registry = new Map<string, readonly string[]>();
  for (const item of capabilities) {
    if (!item.id || registry.has(item.id)) throw new EntityWorldError("invalid-command", "Duplicate or empty component capability.");
    registry.set(item.id, Object.freeze([...item.requires]));
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new EntityWorldError("missing-dependency", `Component dependency cycle at ${id}.`);
    if (visited.has(id)) return;
    const dependencies = registry.get(id);
    if (!dependencies) throw new EntityWorldError("missing-dependency", `No backend capability for dependency ${id}.`);
    visiting.add(id); dependencies.forEach(visit); visiting.delete(id); visited.add(id);
  };
  registry.forEach((_, id) => visit(id));
  return (components: readonly string[]) => {
    const selected = new Set(components);
    if (selected.size !== components.length) throw new EntityWorldError("invalid-command", "Duplicate component in entity creation.");
    for (const id of components) {
      const requires = registry.get(id);
      if (!requires) throw new EntityWorldError("unsupported-component", `Runtime creation has no backend for ${id}.`);
      for (const dependency of requires) {
        if (!selected.has(dependency)) throw new EntityWorldError("missing-dependency", `${id} requires ${dependency}.`);
      }
    }
  };
}

/** Capture caller-owned inputs at enqueue; bound payload size as well as command count. */
export function copyEntityCommands(commands: readonly EntityCommand[]): readonly EntityCommand[] {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > 128) {
    throw new EntityWorldError("capacity", "A structural batch must contain 1–128 commands.");
  }
  const shortText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
  return Object.freeze(commands.map((command) => {
    if ((command?.op === "destroy" || command?.op === "destroySubtree" || command?.op === "setTags") && command.handle && typeof command.handle.world === "symbol"
      && Number.isInteger(command.handle.slot) && Number.isInteger(command.handle.generation)) {
      const { world, slot, generation } = command.handle;
      if (command.op === "setTags") {
        if (!Array.isArray(command.tags)) throw new EntityWorldError("invalid-command", "setTags requires an array containing zero or one tag.");
        return Object.freeze({ op: "setTags" as const, handle: Object.freeze({ world, slot, generation }), tags: captureEntityTags(command.tags) });
      }
      return Object.freeze({ op: command.op, handle: Object.freeze({ world, slot, generation }) });
    }
    if (command?.op === "create" && shortText(command.key) && shortText(command.name)) {
      if (command.parentKey !== undefined && !shortText(command.parentKey)) throw new EntityWorldError("invalid-command", "Invalid parent creation key.");
      const transform = command.transform === undefined ? undefined : captureEntityTransform(command.transform);
      let primitive, behaviors, model, character;
      try {
        validateRuntimeModelAnimator(command.model?.animator);
        model = command.model === undefined ? undefined : captureRuntimeModel(command.model);
        primitive = command.primitive === undefined ? undefined : captureRuntimePrimitive(command.primitive);
        character = command.character === undefined ? undefined : captureRuntimeCharacter(command.character);
        behaviors = command.behaviors === undefined ? undefined : captureBehaviorComponent(command.behaviors);
      }
      catch (error) { throw new EntityWorldError("invalid-command", String(error)); }
      if (character && primitive) throw new EntityWorldError("invalid-command", "A runtime character cannot also be a dynamic primitive.");
      if (model?.animator?.enabled && model.animator.rootMotion.mode === "applyToObject"
        && (primitive || character && model.animator.rootMotion.rotation === "full")) throw new EntityWorldError("invalid-command", primitive
        ? "Dynamic model Animator root motion cannot apply to a GPU body; use disabled or extractOnly."
        : "Runtime character root motion supports yaw rotation only; use extractOnly for full rotation.");
      if (character && Boolean(character.render) === Boolean(model)) throw new EntityWorldError("missing-dependency", "A runtime character requires exactly one primitive render shape or imported model.");
      if (character && model && (model.worldTransform.position.some((n, i) => n !== character!.position[i])
        || model.worldTransform.rotation.some((n, i) => n !== character!.rotation![i]))) throw new EntityWorldError("invalid-command", "Runtime model and character initial world poses must match.");
      const defaults = character ? RUNTIME_CHARACTER_COMPONENTS : primitive ? RUNTIME_PRIMITIVE_COMPONENTS : model ? RUNTIME_MODEL_COMPONENTS : transform ? ["transform"] : [];
      const components = command.components ?? (model?.animator?.enabled ? [...defaults, "animator"] : defaults);
      if (Array.isArray(components) && components.length <= 32 && components.every(shortText)) {
        if (model && RUNTIME_MODEL_COMPONENTS.some((id) => !components.includes(id))) throw new EntityWorldError("missing-dependency", "A model requires transform and mesh components.");
        if (model?.animator?.enabled && !components.includes("animator")) throw new EntityWorldError("missing-dependency", "An enabled model Animator requires the animator capability.");
        if (primitive && RUNTIME_PRIMITIVE_COMPONENTS.some((id) => !components.includes(id))) throw new EntityWorldError("missing-dependency", "A runtime primitive requires transform, mesh, collider and rigidbody components.");
        if (character && RUNTIME_CHARACTER_COMPONENTS.some((id) => !components.includes(id))) throw new EntityWorldError("missing-dependency", "A runtime character requires transform, mesh, collider, rigidbody and characterController components.");
        if (!character && components.includes("characterController")) throw new EntityWorldError("missing-dependency", "A runtime Character Controller requires its captured character descriptor.");
        if (transform && !components.includes("transform")) throw new EntityWorldError("missing-dependency", "A local transform requires the transform capability.");
        return Object.freeze({ op: "create" as const, key: command.key, name: command.name, tags: captureEntityTags(command.tags), behaviors, components: Object.freeze([...components]), primitive, model, character, parentKey: command.parentKey, transform });
      }
    }
    throw new EntityWorldError("invalid-command", "Malformed entity command (text limit 256; component limit 32).");
  }));
}

export function stageEntityChange(slots: EntitySlots, commands: readonly EntityCommand[], validateComponents: (ids: readonly string[]) => void, bindings: ReadonlyMap<string, symbol> = new Map(), authorized: ReadonlySet<symbol> = new Set(), supportsAuthoredRemoval = false): EntityChangePlan {
  const created: Array<{ key: string; entity: WorldEntity }> = [], removed: WorldEntity[] = [];
  const retagged: Array<{ before: WorldEntity; after: WorldEntity }> = [], touched = new Set<number>();
  const reservations = new Map<WorldEntity["handle"], symbol>(), used = new Set<symbol>();
  const keys = new Map<string, Extract<EntityCommand, { op: "create" }>>(), removals = new Set<number>();
  try {
    for (const command of expandEntityDestruction(slots, commands)) {
      if (command.op === "create") {
        if (keys.has(command.key)) throw new EntityWorldError("invalid-command", `Duplicate creation key: ${command.key}.`);
        keys.set(command.key, command);
      } else {
        const entity = slots.inspect(command.handle), token = slots.reservationFor(entity.handle);
        if (touched.has(entity.handle.slot)) throw new EntityWorldError("invalid-command", "An entity may be changed only once per batch.");
        touched.add(entity.handle.slot);
        if (command.op === "setTags") {
          retagged.push(Object.freeze({ before: entity, after: Object.freeze({ ...entity, tags: command.tags }) }));
          continue;
        }
        if (token !== undefined) {
          if (!authorized.has(token)) throw new EntityWorldError("invalid-command", "Return pooled entities through their owning pool.");
          reservations.set(entity.handle, token);
        }
        if (entity.authoredId !== undefined && !supportsAuthoredRemoval) throw new EntityWorldError("authored-entity", "Removing captured scene entities requires renderer/physics lifecycle integration.");
        if (removals.has(entity.handle.slot)) throw new EntityWorldError("invalid-command", "Cannot destroy the same entity twice in a batch.");
        removals.add(entity.handle.slot); removed.push(entity);
      }
    }
    for (const entity of removed) for (const child of slots.children(entity.handle)) {
      if (!removals.has(child.slot)) throw new EntityWorldError("invalid-command", "Destroying a parent requires its children in the same batch.");
    }
    const resolved = new Map<string, WorldEntity>(), visiting = new Set<string>();
    const create = (key: string): WorldEntity => {
      const existing = resolved.get(key); if (existing) return existing;
      const command = keys.get(key);
      if (!command || visiting.has(key)) throw new EntityWorldError("invalid-command", "Creation parents must form an acyclic hierarchy within the batch.");
      visiting.add(key);
      const parent = command.parentKey === undefined ? undefined : create(command.parentKey).handle;
      const components = command.components ?? Object.freeze([]); validateComponents(components);
      const token = bindings.get(key);
      if (token !== undefined && (!authorized.has(token) || used.has(token))) throw new EntityWorldError("invalid-command", "Repeated or foreign pool reservation.");
      if (token !== undefined) used.add(token);
      const entity = slots.reserve(command.name, components, undefined, { model: command.model, primitive: command.primitive, character: command.character, parent, transform: command.transform, tags: command.tags, behaviors: command.behaviors }, token);
      if (token !== undefined) reservations.set(entity.handle, token);
      created.push(Object.freeze({ key, entity })); resolved.set(key, entity); visiting.delete(key); return entity;
    };
    keys.forEach((_, key) => create(key));
    return Object.freeze({ created: Object.freeze(created), removed: Object.freeze(removed), reservations, retagged: Object.freeze(retagged) });
  } catch (error) { created.forEach(({ entity }) => slots.cancel(entity.handle)); throw error; }
}
