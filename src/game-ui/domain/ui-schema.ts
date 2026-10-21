import { UI_KINDS, UI_LIMITS } from "./ui-document";

type Schema = Readonly<Record<string, unknown>>;
const num = (minimum: number, maximum: number): Schema => ({ type: "number", minimum, maximum });
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const text = (maxLength: number): Schema => ({ type: "string", maxLength });
const length: Schema = { anyOf: [num(0, 10000), { type: "string", pattern: "^(auto|[0-9]+(?:\\.[0-9]+)?%)$" }] };
const offset: Schema = { anyOf: [num(-10000, 10000), { type: "string", pattern: "^(auto|-?[0-9]+(?:\\.[0-9]+)?%)$" }] };
export const uiColorSchema: Schema = { type: "string", pattern: "^(#[a-fA-F0-9]{3,4}|#[a-fA-F0-9]{6}|#[a-fA-F0-9]{8}|transparent|currentColor|\\$[a-zA-Z][a-zA-Z0-9_-]{0,31})$" };
const assetRef: Schema = { type: "object", properties: { guid: { type: "string", pattern: "^[a-fA-F0-9]{32}$" }, localId: { const: "main" } }, required: ["guid"], additionalProperties: false };
export const uiStyleProperties: Readonly<Record<string, Schema>> = {
  font: assetRef, fit: choice("contain", "cover", "fill"),
  layout: choice("row", "column", "grid", "overlay"), position: choice("flow", "absolute"),
  width: length, height: length, minWidth: length, maxWidth: length, minHeight: length, maxHeight: length,
  left: offset, right: offset, top: offset, bottom: offset,
  gap: num(0, 512), padding: num(0, 512), grow: num(0, 100), columns: { type: "integer", minimum: 1, maximum: 24 }, cellMin: num(1, 4096), wrap: { type: "boolean" },
  align: choice("start", "center", "end", "stretch"), justify: choice("start", "center", "end", "space-between", "space-around"),
  overflow: choice("visible", "hidden", "auto"), background: uiColorSchema, color: uiColorSchema, borderColor: uiColorSchema,
  borderWidth: num(0, 32), radius: num(0, 1000), fontSize: num(8, 256), fontWeight: { type: "integer", minimum: 100, maximum: 900 }, textAlign: choice("left", "center", "right"),
  opacity: num(0, 1), x: num(-10000, 10000), y: num(-10000, 10000), scale: num(0, 100), rotate: num(-36000, 36000), pointer: choice("pass", "block"),
};
const object = (properties: Readonly<Record<string, Schema>>, required: readonly string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
export const uiStyleSchema = object(uiStyleProperties);
export const uiIdSchema: Schema = { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$" };
export const uiNodeProperties: Readonly<Record<string, Schema>> = {
  image: assetRef, id: uiIdSchema, kind: choice(...UI_KINDS), text: text(4096), label: text(256), action: uiIdSchema,
  value: { anyOf: [text(4096), num(-1e9, 1e9), { type: "boolean" }] },
  min: num(-1e9, 1e9), max: num(-1e9, 1e9), step: { type: "number", exclusiveMinimum: 0, maximum: 1e9 },
  visible: { type: "boolean" }, disabled: { type: "boolean" }, style: uiStyleSchema,
  responsive: { type: "array", maxItems: 8, items: object({ minWidth: num(0, 10000), style: uiStyleSchema }, ["minWidth", "style"]) },
};
/** Recursive schema can be embedded under an operation's $defs by the transport owner. */
export const uiNodeSchema = object({ ...uiNodeProperties, children: { type: "array", maxItems: UI_LIMITS.nodesPerScreen, items: { $ref: "#/$defs/uiNode" } } }, ["id", "kind"]);
export const uiDocumentSchema: Schema = object({ version: { const: 1 }, enabled: { type: "boolean" }, order: { type: "integer", minimum: -1000, maximum: 1000 },
  theme: { type: "object", maxProperties: 32, propertyNames: { pattern: "^[a-zA-Z][a-zA-Z0-9_-]{0,31}$" }, additionalProperties: uiColorSchema },
  navigation: object({ enabled: { type: "boolean" }, wrap: { type: "boolean" }, initialFocus: uiIdSchema, cancel: uiIdSchema }, ["enabled"]),
  root: { $ref: "#/$defs/uiNode" },
}, ["version", "enabled", "order", "theme", "root"]);

/** Small closed-schema validator shared by authoring and runtime; never executes payload code. */
export function assertUiSchema(value: unknown, schema: Schema, path: string): void {
  const fail = (): never => { throw new Error(`UI ${path}: invalid value (${JSON.stringify(schema)}).`); };
  if (schema.$ref) return assertUiSchema(value, uiNodeSchema, path);
  if (schema.anyOf) {
    for (const option of schema.anyOf as Schema[]) { try { assertUiSchema(value, option, path); return; } catch { /* Try the other supported type. */ } }
    return fail();
  }
  if ("const" in schema && value !== schema.const) fail();
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) fail();
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const raw = value as Record<string, unknown>, properties = schema.properties as Record<string, Schema> | undefined;
    if (Object.keys(raw).length > Number(schema.maxProperties ?? Infinity)) fail();
    for (const key of schema.required as string[] ?? []) if (!(key in raw)) fail();
    for (const [key, item] of Object.entries(raw)) {
      if (schema.propertyNames) assertUiSchema(key, schema.propertyNames as Schema, `${path}.key`);
      const child = properties?.[key] ?? schema.additionalProperties;
      if (!child || typeof child !== "object") fail();
      assertUiSchema(item, child as Schema, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > Number(schema.maxItems ?? Infinity)) return fail();
    value.forEach((item, index) => assertUiSchema(item, schema.items as Schema, `${path}[${index}]`));
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || schema.type === "integer" && !Number.isInteger(value)
      || value < Number(schema.minimum ?? -Infinity) || value > Number(schema.maximum ?? Infinity)
      || schema.exclusiveMinimum !== undefined && value <= Number(schema.exclusiveMinimum)) fail();
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length > Number(schema.maxLength ?? Infinity) || schema.pattern && !new RegExp(String(schema.pattern)).test(value)) fail();
  } else if (schema.type === "boolean" && typeof value !== "boolean") fail();
}
