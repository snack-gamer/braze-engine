import { INPUT_LIMITS } from "./action-map-limits.mjs";
import { INPUT_ACTION_MAP_ASSET_VERSION } from "./input-action-map-asset-identity.mjs";

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>, required: string[]): Schema => ({ type: "object", properties, required, additionalProperties: false });
const index = (maximum: number) => ({ type: "integer", minimum: 0, maximum: maximum - 1 });
const scale = { type: "number", minimum: -100, maximum: 100, not: { const: 0 }, default: 1,
  description: "Nonzero multiplier. Use -1 for the negative direction of an axis." };
const binding = (device: string, fields: Record<string, Schema>, required: string[]) => object({ device: { const: device }, scale, ...fields }, ["device", ...required]);
const discreteBindings = [
  binding("keyboard", { code: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]{0,63}$", description: "Physical KeyboardEvent.code, e.g. KeyW, Space, ArrowLeft." } }, ["code"]),
  binding("pointer-button", { button: index(5) }, ["button"]),
  binding("gamepad-button", { button: index(INPUT_LIMITS.buttons) }, ["button"]),
  binding("gamepad-axis", { axis: index(INPUT_LIMITS.axes), deadzone: { type: "number", minimum: 0, exclusiveMaximum: 1, default: 0.15 } }, ["axis"]),
];
const pointerDelta = binding("pointer-delta", { axis: { enum: ["x", "y"] } }, ["axis"]);
const action = (kinds: string[], bindings: Schema[]) => object({
  name: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$", description: "Unique, case-sensitive action name consumed by context.input.action(name)." },
  kind: { type: "string", enum: kinds }, bindings: { type: "array", maxItems: INPUT_LIMITS.bindings, items: { anyOf: bindings } },
}, ["name", "kind", "bindings"]);

/** The input feature owns transport shape; the shared codec validates semantics at every write. */
export const inputMapDocumentSchema = object({
  version: { const: INPUT_ACTION_MAP_ASSET_VERSION },
  name: { type: "string", minLength: 1, maxLength: 128, pattern: "^[^\\u0000-\\u001f]+$" },
  map: object({ version: { const: 1 }, actions: { type: "array", maxItems: INPUT_LIMITS.actions,
    items: { anyOf: [action(["button", "axis"], discreteBindings), action(["delta"], [...discreteBindings, pointerDelta])] } } }, ["version", "actions"]),
}, ["version", "name", "map"]);

export const inputAssetGuidSchema = { type: "string", pattern: "^[a-fA-F0-9]{32}$", description: "Stable Input Action Map GUID from assets.list or an applied input.map.create." };
export const inputRevisionSchema = { type: "string", pattern: "^[a-fA-F0-9]{64}$", description: "Saved SHA-256 revision from input.map.inspect. Never a live scene revision." };
export const inputFolderSchema = { type: "string", maxLength: 1024, description: "Optional project Assets-relative folder; no absolute paths, traversal, backslashes, URLs or empty path segments. Defaults to Assets root." };
