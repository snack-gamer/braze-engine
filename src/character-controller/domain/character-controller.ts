import type { CharacterMovementSettings } from "./character-movement";
export const CHARACTER_CONTROLLER_VERSION = 1 as const;

/**
 * Declares one scene object as the owner of a kinematic character motor.
 *
 * Shape and body settings deliberately remain owned by the referenced Capsule
 * Collider and Kinematic Rigidbody. Keeping those values out of this component
 * prevents two authored sources of truth for the same collision body.
 */
export type CharacterControllerComponent = Readonly<{
  version: typeof CHARACTER_CONTROLLER_VERSION;
  enabled: boolean;
  capsuleColliderId: string;
  /** Missing in older v1 documents; resolves to DEFAULT_CHARACTER_MOVEMENT. */
  movement?: CharacterMovementSettings;
}>;
