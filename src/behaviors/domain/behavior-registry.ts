import { BEHAVIOR_DOCUMENT_LIMITS, type BehaviorEntry, type BehaviorValues } from "./behavior-component";
import type { BehaviorField, BehaviorRegistration } from "./behavior-registration";
import { BehaviorValidationError, behaviorRecord, behaviorString, behaviorVersion, parseBehaviorValues } from "./behavior-validation";
export { BehaviorValidationError } from "./behavior-validation";

function validateFieldValue(field: BehaviorField, value: unknown): void {
  const path = `field ${field.key}`;
  switch (field.kind) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)
        || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
        throw new BehaviorValidationError(path, "number is outside its permitted range");
      }
      break;
    case "string":
      if (typeof value !== "string" || value.length > (field.maxLength ?? BEHAVIOR_DOCUMENT_LIMITS.stringLength)) {
        throw new BehaviorValidationError(path, "text exceeds its permitted length or is not a string");
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") throw new BehaviorValidationError(path, "expected a boolean");
      break;
    case "entity":
      if (value !== null && (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, "entityId"))) {
        throw new BehaviorValidationError(path, "expected an entity reference or null");
      }
      break;
    default: throw new BehaviorValidationError(path, "unsupported field kind");
  }
}

/** Defaults are filled only when absent; explicit zero, false, empty text and null survive. */
export function resolveBehaviorValues(registration: BehaviorRegistration, values: BehaviorValues): BehaviorValues {
  const parsed = parseBehaviorValues(values);
  const next = { ...parsed };
  for (const field of registration.fields) {
    const value = Object.prototype.hasOwnProperty.call(parsed, field.key) ? parsed[field.key] : field.default;
    validateFieldValue(field, value);
    Object.defineProperty(next, field.key, { value, enumerable: true, writable: true, configurable: true });
  }
  return parseBehaviorValues(next);
}

function captureField(value: unknown, index: number): BehaviorField {
  const input = behaviorRecord(value, `fields[${index}]`);
  const key = behaviorString(input.key, `fields[${index}].key`, BEHAVIOR_DOCUMENT_LIMITS.keyLength);
  const label = behaviorString(input.label, `field ${key}.label`, 128);
  const base = { key, label };
  let field: BehaviorField;
  switch (input.kind) {
    case "number": {
      const min = input.min; const max = input.max;
      for (const limit of [min, max]) {
        if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit))) {
          throw new BehaviorValidationError(`field ${key}`, "numeric bounds must be finite");
        }
      }
      if (typeof min === "number" && typeof max === "number" && min > max) {
        throw new BehaviorValidationError(`field ${key}`, "minimum cannot exceed maximum");
      }
      field = { ...base, kind: "number", default: input.default as number,
        ...(min === undefined ? {} : { min: min as number }), ...(max === undefined ? {} : { max: max as number }) };
      break;
    }
    case "string": {
      const maxLength = input.maxLength;
      if (maxLength !== undefined && (typeof maxLength !== "number" || !Number.isSafeInteger(maxLength)
        || maxLength < 0 || maxLength > BEHAVIOR_DOCUMENT_LIMITS.stringLength)) {
        throw new BehaviorValidationError(`field ${key}`, `text limit must be 0–${BEHAVIOR_DOCUMENT_LIMITS.stringLength}`);
      }
      field = { ...base, kind: "string", default: input.default as string,
        ...(maxLength === undefined ? {} : { maxLength: maxLength as number }) };
      break;
    }
    case "boolean": field = { ...base, kind: "boolean", default: input.default as boolean }; break;
    case "entity": field = { ...base, kind: "entity", default: input.default as null }; break;
    default: throw new BehaviorValidationError(`field ${key}`, "unsupported field kind");
  }
  const captured = parseBehaviorValues({ [key]: field.default })[key];
  validateFieldValue(field, captured);
  return Object.freeze({ ...field, default: captured }) as BehaviorField;
}

/** A registry is explicit code supplied by the project, never code loaded from scene JSON. */
export function validateBehaviorRegistry(registrations: readonly BehaviorRegistration[]): readonly BehaviorRegistration[] {
  if (!Array.isArray(registrations) || registrations.length > BEHAVIOR_DOCUMENT_LIMITS.registrations) {
    throw new BehaviorValidationError("behaviors", `expected at most ${BEHAVIOR_DOCUMENT_LIMITS.registrations} registrations`);
  }
  const identities = new Set<string>();
  return Object.freeze(registrations.map((value, index) => {
    const input = behaviorRecord(value, `behaviors[${index}]`);
    const id = behaviorString(input.id, "behavior.id", BEHAVIOR_DOCUMENT_LIMITS.typeLength);
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(id)) throw new BehaviorValidationError(id, "type identity must use letters, digits, _, ., :, or -");
    if (identities.has(id)) throw new BehaviorValidationError(id, "duplicate behavior registration");
    identities.add(id);
    const label = behaviorString(input.label, `${id}.label`, 128);
    const version = behaviorVersion(input.version, `${id}.version`);
    if (typeof input.create !== "function") throw new BehaviorValidationError(id, "create must be a synchronous factory");
    if (!Array.isArray(input.fields) || input.fields.length > BEHAVIOR_DOCUMENT_LIMITS.fields) {
      throw new BehaviorValidationError(id, `expected at most ${BEHAVIOR_DOCUMENT_LIMITS.fields} fields`);
    }
    const fields = input.fields.map(captureField);
    if (new Set(fields.map((field) => field.key)).size !== fields.length) throw new BehaviorValidationError(id, "duplicate field key");
    const description = input.description === undefined ? undefined
      : behaviorString(input.description, `${id}.description`, BEHAVIOR_DOCUMENT_LIMITS.stringLength);
    return Object.freeze({ id, label, version, fields: Object.freeze(fields), create: value.create,
      ...(description === undefined ? {} : { description }) });
  }));
}

export function createBehaviorEntry(registration: BehaviorRegistration, id: string): BehaviorEntry {
  return Object.freeze({
    id: behaviorString(id, "entry.id", BEHAVIOR_DOCUMENT_LIMITS.idLength),
    type: registration.id, typeVersion: registration.version, enabled: true,
    values: resolveBehaviorValues(registration, {}),
  });
}
