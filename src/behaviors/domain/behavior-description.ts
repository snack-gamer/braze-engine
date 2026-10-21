import { validateBehaviorRegistry } from "./behavior-registry";
import type { BehaviorRegistration } from "./behavior-registration";

/** Serializable public authoring metadata; never exposes or invokes project factories. */
export function describeBehaviorRegistry(registrations: readonly BehaviorRegistration[]) {
  return Object.freeze(validateBehaviorRegistry(registrations).map(({ id, label, description, version, fields }) =>
    Object.freeze({ id, label, ...(description === undefined ? {} : { description }), version, fields })));
}
