import { createAuthoredId } from "../../identity/authored-id";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorEntry, BehaviorValue } from "../domain/behavior-component";
import { createBehaviorComponent } from "../domain/behavior-component";
import { createBehaviorEntry, resolveBehaviorValues } from "../domain/behavior-registry";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { ENTITY_BEHAVIOR_LIMITS } from "../domain/entity-behaviors";

function editableComponent(object: SceneObject) {
  const component = object.behaviors;
  if (!component || component.unavailable) throw new Error("Behavior settings are unavailable for editing.");
  return component;
}

function updateEntry(object: SceneObject, id: string, update: (entry: BehaviorEntry) => BehaviorEntry): Partial<SceneObject> {
  const component = editableComponent(object);
  if (!component.entries.some((entry) => entry.id === id)) throw new Error("Behavior entry no longer exists.");
  return { behaviors: { ...component, entries: component.entries.map((entry) => entry.id === id ? update(entry) : entry) } };
}

export function addBehaviorComponent(): Partial<SceneObject> {
  return { behaviors: createBehaviorComponent() };
}

export function removeBehaviorComponent(): Partial<SceneObject> {
  return { behaviors: undefined };
}

export function addBehaviorEntry(
  object: SceneObject,
  registration: BehaviorRegistration,
  id = createAuthoredId("behavior"),
): Partial<SceneObject> {
  const component = editableComponent(object);
  if (component.entries.length >= ENTITY_BEHAVIOR_LIMITS.perEntity) {
    throw new Error(`An object supports up to ${ENTITY_BEHAVIOR_LIMITS.perEntity} behaviors.`);
  }
  if (component.entries.some((entry) => entry.id === id)) throw new Error("Behavior entry identity already exists.");
  return { behaviors: { ...component, entries: [...component.entries, createBehaviorEntry(registration, id)] } };
}

export function removeBehaviorEntry(object: SceneObject, id: string): Partial<SceneObject> {
  const component = editableComponent(object);
  return { behaviors: { ...component, entries: component.entries.filter((entry) => entry.id !== id) } };
}

export function setBehaviorEntryEnabled(object: SceneObject, id: string, enabled: boolean): Partial<SceneObject> {
  return updateEntry(object, id, (entry) => ({ ...entry, enabled }));
}

export function resetBehaviorEntryValues(object: SceneObject, id: string, registration: BehaviorRegistration): Partial<SceneObject> {
  return updateEntry(object, id, (entry) => {
    if (entry.type !== registration.id || entry.typeVersion !== registration.version) {
      throw new Error("Behavior definition does not match the saved entry version.");
    }
    const defaults = resolveBehaviorValues(registration, {});
    return { ...entry, values: resolveBehaviorValues(registration, { ...entry.values, ...defaults }) };
  });
}

export function setBehaviorFieldValue(
  object: SceneObject,
  id: string,
  registration: BehaviorRegistration,
  key: string,
  value: BehaviorValue,
): Partial<SceneObject> {
  if (!registration.fields.some((field) => field.key === key)) throw new Error("Behavior field is not registered.");
  return updateEntry(object, id, (entry) => {
    if (entry.type !== registration.id || entry.typeVersion !== registration.version) {
      throw new Error("Behavior definition does not match the saved entry version.");
    }
    // Validate this field independently so another invalid saved field remains repairable.
    const validated = resolveBehaviorValues({ ...registration, fields: registration.fields.filter((field) => field.key === key) }, { [key]: value });
    return { ...entry, values: { ...entry.values, [key]: validated[key] } };
  });
}

export function behaviorEntryIssue(entry: BehaviorEntry, registration: BehaviorRegistration | undefined): string | undefined {
  if (!registration) return `Missing definition: ${entry.type}. Saved settings are retained until the definition is restored.`;
  if (entry.typeVersion !== registration.version) {
    return `Saved version ${entry.typeVersion}; definition version ${registration.version}. Restore the matching definition to edit or run this behavior.`;
  }
  try { resolveBehaviorValues(registration, entry.values); }
  catch (error) { return error instanceof Error ? error.message : String(error); }
  return undefined;
}
