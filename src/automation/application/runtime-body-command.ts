import type { RigidBodyCommand } from "../../physics/gpu/rigid-body-commands";

function vector(value: unknown, size: number): number[] {
  if (!Array.isArray(value) || value.length !== size || !value.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error(`Expected ${size} finite numbers.`);
  return value;
}
export function parseRuntimeBodyCommand(request: Record<string, unknown>): RigidBodyCommand {
  if (request.kind === "kinematic-target") return { kind: request.kind, body: -1, position: vector(request.position, 3), orientation: vector(request.orientation, 4) };
  if (request.kind === "impulse" || request.kind === "velocity" || request.kind === "force") return { kind: request.kind, body: -1, linear: vector(request.linear, 3), angular: request.angular === undefined ? undefined : vector(request.angular, 3) };
  throw new Error("Expected impulse, velocity, force or kinematic-target.");
}
