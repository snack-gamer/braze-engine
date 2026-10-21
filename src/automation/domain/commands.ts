import type { Vec3 } from "../../scene/domain/scene-values";
import { captureEntityTags } from "../../world/domain/entity-tags";
import { captureBehaviorComponent, type BehaviorComponent } from "../../behaviors/domain/behavior-component";
import { captureUiDocument } from "../../game-ui/domain/ui-validation";
import { assertAnimatorAuthoringShape } from "../../character/domain/animator-authoring-shape";

export const AUTOMATION_VERSION = 1;
export const AUTOMATION_PRIMITIVES = ["cube", "sphere", "plane", "transform", "camera", "directionalLight", "gltf", "fbx"] as const;
export type ObjectPatch = {
  name?: string; color?: string; visible?: boolean; parentId?: string;
  tags?: readonly string[];
  position?: Vec3; rotation?: Vec3; scale?: Vec3;
};
export type SceneCommand =
  | { op: "object.create"; id: string; primitive: typeof AUTOMATION_PRIMITIVES[number]; values?: ObjectPatch; assetRef?: { guid: string; localId: string } }
  | { op: "object.update"; id: string; values: ObjectPatch }
  | { op: "object.delete"; id: string }
  | { op: "component.set"; id: string; component: "rigidbody" | "collider" | "characterController" | "joint" | "behaviors" | "uiCanvas" | "animator"; values: Record<string, unknown> }
  | { op: "component.remove"; id: string; component: "rigidbody" | "collider" | "characterController" | "joint" | "behaviors" | "uiCanvas" | "animator"; colliderId?: string };

const patches = new Set(["name", "tags", "color", "visible", "parentId", "position", "rotation", "scale"]);
const fields = {
  rigidbody: new Set(["enabled", "bodyType", "massMode", "mass", "density", "useGravity", "linearDamping", "angularDamping", "interpolation"]),
  joint: new Set(["enabled", "kind", "connectedObjectId", "anchor", "connectedAnchor", "axis", "restLength", "collideConnected", "limitsEnabled", "minAngle", "maxAngle"]),
  characterController: new Set(["enabled", "capsuleColliderId", "skinWidth", "stepHeight", "groundSnap", "maxSlopeDegrees"]),
  collider: new Set(["id", "enabled", "shape", "geometry", "center", "size", "radius", "length", "axis", "friction", "restitution", "collisionLayer", "collisionMask", "isTrigger", "showGizmo"]),
};
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
export function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error(`${label} must be a nonempty string of at most 256 characters.`);
  return value;
}
function values(value: unknown, allowed: Set<string>): Record<string, unknown> {
  const result = record(value, "values");
  for (const [key, item] of Object.entries(result)) {
    if (!allowed.has(key)) throw new Error(`Unsupported field: ${key}`);
    if (key === "tags") { captureEntityTags(item); continue; }
    if (key === "geometry") {
      const geometry = record(item, "geometry");
      if (!Array.isArray(geometry.vertices) || !geometry.vertices.every((v) => typeof v === "number" && Number.isFinite(v))
        || !Array.isArray(geometry.indices) || !geometry.indices.every((v) => typeof v === "number" && Number.isInteger(v))) throw new Error("geometry requires numeric vertices and integer indices.");
      continue;
    }
    if (["connectedObjectId", "connectedAnchor", "restLength"].includes(key) && item === null) continue;
    if (["anchor", "connectedAnchor"].includes(key) || key === "axis" && Array.isArray(item)) {
      if (!Array.isArray(item) || item.length !== 3 || !item.every((v) => typeof v === "number" && Number.isFinite(v))) throw new Error(`${key} requires three finite numbers.`);
      continue;
    }
    if (["minAngle", "maxAngle"].includes(key)) {
      if (typeof item !== "number" || !Number.isFinite(item) || item < -180 || item > 180) throw new Error(`${key} must be between -180 and 180 degrees.`);
      continue;
    }
    if (["position", "rotation", "scale", "center", "size"].includes(key)) {
      if (!Array.isArray(item) || item.length !== 3 || !item.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error(`${key} requires three finite numbers.`);
      if (["scale", "size"].includes(key) && item.some((n) => n <= 0)) throw new Error(`${key} must be positive.`);
    } else if (["visible", "enabled", "useGravity", "isTrigger", "showGizmo", "collideConnected", "limitsEnabled"].includes(key)) {
      if (typeof item !== "boolean") throw new Error(`${key} must be boolean.`);
    } else if (["restLength", "mass", "density", "linearDamping", "angularDamping", "radius", "length", "friction", "restitution", "collisionLayer", "collisionMask", "skinWidth", "stepHeight", "groundSnap", "maxSlopeDegrees"].includes(key)) {
      if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || (["mass", "density", "radius", "length"].includes(key) && item === 0)) throw new Error(`${key} must be a valid nonnegative number (mass, density and radius must be positive).`);
    } else string(item, key);
  }
  for (const [key, min, max] of [["skinWidth", 0.001, 0.2], ["stepHeight", 0, 2], ["groundSnap", 0, 2], ["maxSlopeDegrees", 0, 89]] as const) {
    if (result[key] !== undefined && (Number(result[key]) < min || Number(result[key]) > max)) throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  if (result.restitution !== undefined && Number(result.restitution) > 1) throw new Error("restitution must be between 0 and 1.");
  for (const [key, max] of [["collisionLayer", 31], ["collisionMask", 0xffffffff]] as const) {
    if (result[key] !== undefined && (!Number.isInteger(result[key]) || Number(result[key]) > max)) throw new Error(`${key} must be an integer between 0 and ${max}.`);
  }
  if (typeof result.axis === "string" && !["x", "y", "z"].includes(String(result.axis))) throw new Error("Invalid capsule axis.");
  if (result.kind && !["distance", "ball", "fixed", "hinge"].includes(String(result.kind))) throw new Error("Unknown joint kind.");
  if (result.bodyType && !["dynamic", "kinematic"].includes(String(result.bodyType))) throw new Error("Invalid Rigidbody bodyType.");
  if (result.massMode && !["manual", "automatic"].includes(String(result.massMode))) throw new Error("Invalid massMode.");
  if (result.interpolation && result.interpolation !== "none") throw new Error("Interpolation is not implemented.");
  if (result.shape && !["box", "sphere", "capsule", "mesh"].includes(String(result.shape))) throw new Error("Supported collision shapes: box, sphere, capsule and static mesh.");
  return result;
}
export function parseSceneCommands(input: unknown): SceneCommand[] {
  if (!Array.isArray(input) || !input.length || input.length > 2048) throw new Error("commands must contain 1–2048 operations.");
  return input.map((value) => {
    const raw = record(value, "command"); const id = string(raw.id, "id");
    switch (raw.op) {
      case "object.create": {
        if (!AUTOMATION_PRIMITIVES.includes(raw.primitive as never)) throw new Error("Unsupported primitive.");
        let assetRef: { guid: string; localId: string } | undefined;
        if (raw.assetRef !== undefined) {
          const asset = record(raw.assetRef, "assetRef"); assetRef = { guid: string(asset.guid, "guid"), localId: string(asset.localId, "localId") };
        }
        if (["gltf", "fbx"].includes(String(raw.primitive)) && !assetRef) throw new Error("Imported objects require an assetRef from the Asset Database.");
        return { op: raw.op, id, primitive: raw.primitive as typeof AUTOMATION_PRIMITIVES[number], values: raw.values ? values(raw.values, patches) : {}, assetRef };
      }
      case "object.update": return { op: raw.op, id, values: values(raw.values, patches) };
      case "object.delete": return { op: raw.op, id };
      case "component.set":
      case "component.remove": {
        if (raw.component === "animator") {
          if (raw.op === "component.remove") return { op: raw.op, id, component: raw.component };
          const input = record(raw.values, "animator"); assertAnimatorAuthoringShape(input);
          return { op: raw.op, id, component: raw.component, values: input };
        }
        if (raw.component === "uiCanvas") {
          if (raw.op === "component.remove") return { op: raw.op, id, component: raw.component };
          const input = record(raw.values, "uiCanvas"); captureUiDocument(input);
          return { op: raw.op, id, component: raw.component, values: input };
        }
        if (raw.component === "behaviors") {
          if (raw.op === "component.remove") return { op: raw.op, id, component: raw.component };
          const input = record(raw.values, "behaviors");
          captureBehaviorComponent({ version: input.version, entries: input.entries } as BehaviorComponent);
          return { op: raw.op, id, component: raw.component, values: input };
        }
        if (raw.component !== "rigidbody" && raw.component !== "collider" && raw.component !== "characterController" && raw.component !== "joint") throw new Error("Unsupported component.");
        if (raw.op === "component.set" && raw.values && typeof raw.values === "object") {
          const axis = (raw.values as Record<string, unknown>).axis;
          if (axis !== undefined && (raw.component === "joint" ? !Array.isArray(axis) : raw.component === "collider" && typeof axis !== "string")) throw new Error("Joint axes are vectors; Collider axes are x, y or z.");
        }
        return raw.op === "component.set"
          ? { op: raw.op, id, component: raw.component, values: values(raw.values, fields[raw.component]) }
          : { op: raw.op, id, component: raw.component, colliderId: raw.colliderId === undefined ? undefined : string(raw.colliderId, "colliderId") };
      }
      default: throw new Error(`Unknown command: ${String(raw.op)}`);
    }
  });
}
