import {
  CHARACTER_CONTROLLER_VERSION,
  type CharacterControllerComponent,
} from "../domain/character-controller";
import { normalizeCharacterMovement } from "../domain/character-movement";

export const CHARACTER_CONTROLLER_DOCUMENT_VERSION = "braze/character-controller-v1" as const;

function normalizeCharacterController(
  value: unknown,
): CharacterControllerComponent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.version !== undefined
    && raw.version !== CHARACTER_CONTROLLER_VERSION
    && raw.version !== CHARACTER_CONTROLLER_DOCUMENT_VERSION) return undefined;
  const capsuleColliderId = typeof (raw.capsule_collider_id ?? raw.capsuleColliderId) === "string"
    ? String(raw.capsule_collider_id ?? raw.capsuleColliderId).trim()
    : "";
  if (!capsuleColliderId) return undefined;
  return {
    version: CHARACTER_CONTROLLER_VERSION,
    enabled: raw.enabled !== false,
    capsuleColliderId,
    ...(raw.movement === undefined ? {} : { movement: normalizeCharacterMovement(raw.movement) }),
  };
}

export function encodeCharacterController(component: CharacterControllerComponent | undefined) {
  const normalized = normalizeCharacterController(component);
  if (!normalized) return null;
  return {
    version: CHARACTER_CONTROLLER_DOCUMENT_VERSION,
    enabled: normalized.enabled,
    capsule_collider_id: normalized.capsuleColliderId,
    ...(normalized.movement ? { movement: normalized.movement } : {}),
  };
}

export function decodeCharacterController(value: unknown): CharacterControllerComponent | undefined {
  return normalizeCharacterController(value);
}
