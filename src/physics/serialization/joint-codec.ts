import { defaultJoint, JOINT_KINDS, type JointComponent } from "../domain/joint";
import type { PhysicsVec3 } from "../domain/components";

export function decodeJoint(value: unknown): JointComponent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>, defaults = defaultJoint();
  if (raw.version !== undefined && raw.version !== 1 && raw.version !== "braze/joint-v1") return undefined;
  if (raw.kind !== undefined && !JOINT_KINDS.includes(raw.kind as never)) return undefined;
  const vector = (value: unknown, fallback: PhysicsVec3): PhysicsVec3 => Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v)) ? [...value] as PhysicsVec3 : [...fallback];
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const connected = raw.connected_object_id ?? raw.connectedObjectId;
  const connectedAnchor = raw.connected_anchor ?? raw.connectedAnchor;
  const rest = raw.rest_length ?? raw.restLength;
  const minAngle = number(raw.min_angle ?? raw.minAngle, defaults.minAngle, -180, 180);
  const maxAngle = number(raw.max_angle ?? raw.maxAngle, defaults.maxAngle, minAngle, 180);
  return { ...defaults, kind: raw.kind as JointComponent["kind"] ?? defaults.kind, enabled: raw.enabled !== false,
    connectedObjectId: typeof connected === "string" && connected.trim() ? connected : null,
    anchor: vector(raw.anchor, defaults.anchor), connectedAnchor: connectedAnchor == null ? null : vector(connectedAnchor, [0, 0, 0]),
    axis: vector(raw.axis, defaults.axis), restLength: rest == null ? null : number(rest, 0, 0, 1e6),
    collideConnected: (raw.collide_connected ?? raw.collideConnected) === true,
    limitsEnabled: (raw.limits_enabled ?? raw.limitsEnabled) === true, minAngle, maxAngle };
}
export function encodeJoint(value: JointComponent | undefined) {
  const joint = decodeJoint(value); if (!joint) return null;
  return { version: "braze/joint-v1", enabled: joint.enabled, kind: joint.kind,
    connected_object_id: joint.connectedObjectId, anchor: joint.anchor, connected_anchor: joint.connectedAnchor,
    axis: joint.axis, rest_length: joint.restLength, collide_connected: joint.collideConnected,
    limits_enabled: joint.limitsEnabled, min_angle: joint.minAngle, max_angle: joint.maxAngle };
}
