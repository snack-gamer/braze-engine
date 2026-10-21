import { AUTOMATION_PRIMITIVES } from "./commands";
import { uiDocumentSchema } from "../../game-ui/domain/ui-schema";
import { BEHAVIOR_DOCUMENT_LIMITS } from "../../behaviors/domain/behavior-limits";
import { animatorComponentSchema } from "../../character/domain/animator-authoring-schema";

/** Transport descriptions; feature parsers remain the authority for semantic validation. */
export type JsonSchema = Record<string, unknown>;
export const identifier = { type: "string", minLength: 1, maxLength: 256 };
export const boolean = { type: "boolean" };
export const number = { type: "number" };
export const nonnegative = { type: "number", minimum: 0 };
export const positive = { type: "number", exclusiveMinimum: 0 };
export const vector = { type: "array", items: number, minItems: 3, maxItems: 3 };
export const enumeration = (...values: string[]) => ({ type: "string", enum: values });
export const object = (properties: Record<string, JsonSchema>, required: string[] = [], additionalProperties = false): JsonSchema =>
  ({ type: "object", properties, required, additionalProperties });
const nullable = (schema: JsonSchema) => ({ anyOf: [schema, { type: "null" }] });
const bounded = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
export const layer = { type: "integer", minimum: 0, maximum: 31 };
export const mask = { type: "integer", minimum: 0, maximum: 0xffffffff };
const reference = object({ entityId: identifier }, ["entityId"]);
const behaviorValue = { anyOf: [number, boolean, { type: "string", maxLength: BEHAVIOR_DOCUMENT_LIMITS.stringLength }, reference, { type: "null" }] };

export const componentValueSchemas: Record<string, JsonSchema> = {
  animator: animatorComponentSchema,
  uiCanvas: uiDocumentSchema,
  rigidbody: object({ enabled: boolean, bodyType: enumeration("dynamic", "kinematic"), massMode: enumeration("manual", "automatic"),
    mass: { ...positive, description: "Mass in kilograms." }, density: positive, useGravity: boolean,
    linearDamping: nonnegative, angularDamping: nonnegative, interpolation: enumeration("none") }),
  collider: object({ id: { ...identifier, description: "Existing shape ID to edit; omit to add a shape." }, enabled: boolean,
    shape: enumeration("box", "sphere", "capsule", "mesh"), geometry: object({
      vertices: { type: "array", items: number }, indices: { type: "array", items: { type: "integer", minimum: 0 } },
    }, ["vertices", "indices"]), center: vector, size: { ...vector, items: positive }, radius: positive, length: positive,
    axis: enumeration("x", "y", "z"), friction: nonnegative, restitution: bounded(0, 1), collisionLayer: layer, collisionMask: mask,
    isTrigger: boolean, showGizmo: boolean }),
  characterController: object({ enabled: boolean, capsuleColliderId: identifier, skinWidth: bounded(0.001, 0.2),
    stepHeight: bounded(0, 2), groundSnap: bounded(0, 2), maxSlopeDegrees: bounded(0, 89) }),
  joint: object({ enabled: boolean, kind: enumeration("distance", "ball", "fixed", "hinge"), connectedObjectId: nullable(identifier),
    anchor: vector, connectedAnchor: nullable(vector), axis: vector, restLength: nullable(nonnegative), collideConnected: boolean,
    limitsEnabled: boolean, minAngle: bounded(-180, 180), maxAngle: bounded(-180, 180) }),
  behaviors: object({ version: { const: 1 }, entries: { type: "array", maxItems: BEHAVIOR_DOCUMENT_LIMITS.entries,
    items: object({ id: { ...identifier, maxLength: BEHAVIOR_DOCUMENT_LIMITS.idLength },
      type: { ...identifier, maxLength: BEHAVIOR_DOCUMENT_LIMITS.typeLength, description: "Stable ID from editor.behaviors." },
      typeVersion: { type: "integer", minimum: 1 }, enabled: boolean,
      values: { type: "object", maxProperties: BEHAVIOR_DOCUMENT_LIMITS.values, additionalProperties: behaviorValue },
    }, ["id", "type", "typeVersion", "enabled", "values"], true) },
  }, ["version", "entries"], true),
};

const patch = object({ name: identifier, color: identifier, visible: boolean, parentId: identifier,
  tags: { type: "array", maxItems: 1, items: { type: "string", minLength: 1, maxLength: 48 } },
  position: { ...vector, description: "Parent-local metres." }, rotation: { ...vector, description: "Parent-local XYZ Euler degrees." },
  scale: { ...vector, items: positive } });
export const sceneCommandSchema = { oneOf: [
  object({ op: { const: "object.create" }, id: identifier, primitive: enumeration(...AUTOMATION_PRIMITIVES), values: patch,
    assetRef: { ...object({ guid: identifier, localId: identifier }, ["guid", "localId"]), description: "Required for gltf/fbx; discover in assets.list." },
  }, ["op", "id", "primitive"]),
  object({ op: { const: "object.update" }, id: identifier, values: patch }, ["op", "id", "values"]),
  object({ op: { const: "object.delete" }, id: identifier }, ["op", "id"]),
  ...Object.entries(componentValueSchemas).map(([component, values]) => object({ op: { const: "component.set" },
    id: identifier, component: { const: component }, values }, ["op", "id", "component", "values"])),
  object({ op: { const: "component.remove" }, id: identifier, component: enumeration(...Object.keys(componentValueSchemas)),
    colliderId: identifier }, ["op", "id", "component"]),
] };
