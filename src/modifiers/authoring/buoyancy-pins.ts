import type { BuoyancyPin } from "../domain/authored-modifier";
import type { Vec3 } from "../../scene/domain/scene-values";

export function patchBuoyancyPin(
  pins: readonly BuoyancyPin[],
  pinId: string,
  patch: Partial<BuoyancyPin>,
): BuoyancyPin[] {
  return pins.map((pin) => pin.id === pinId ? { ...pin, ...patch } : pin);
}

/** A buoyancy modifier always retains at least one sampling pin. */
export function removeBuoyancyPin(
  pins: BuoyancyPin[],
  pinId: string,
): BuoyancyPin[] {
  const next = pins.filter((pin) => pin.id !== pinId);
  return next.length > 0 ? next : pins;
}

export function patchBuoyancyPinOffset(
  offset: Vec3,
  axis: 0 | 1 | 2,
  value: number,
): Vec3 {
  const next = [...offset] as Vec3;
  next[axis] = value;
  return next;
}
