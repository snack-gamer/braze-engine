import { UI_LIMITS, flattenUi, type UiDocument, type UiNode } from "./ui-document";
import { assertUiSchema, uiDocumentSchema, uiNodeProperties } from "./ui-schema";

function checkTree(value: unknown, depth: number, budget: { nodes: number }): void {
  if (depth > UI_LIMITS.depth || ++budget.nodes > UI_LIMITS.nodesPerScreen) throw new Error(`UI exceeds ${UI_LIMITS.nodesPerScreen} nodes or depth ${UI_LIMITS.depth}.`);
  if (value && typeof value === "object" && "children" in value && Array.isArray(value.children)) {
    for (const child of value.children) checkTree(child, depth + 1, budget);
  }
}
export function validateUiNodeValue(node: UiNode): void {
  if (node.kind !== "panel" && node.children?.length) throw new Error(`UI ${node.id}: only panels can contain children.`);
  if (node.kind === "input" && node.value !== undefined && typeof node.value !== "string"
    || node.kind === "toggle" && node.value !== undefined && typeof node.value !== "boolean"
    || ["slider", "progress"].includes(node.kind) && node.value !== undefined && typeof node.value !== "number") throw new Error(`UI ${node.id}: value does not match ${node.kind}.`);
  if (["slider", "progress"].includes(node.kind)) {
    const min = node.min ?? 0, max = node.max ?? 1, value = node.value ?? min;
    if (max <= min || Number(value) < min || Number(value) > max) throw new Error(`UI ${node.id}: require min < max and value within range.`);
  }
  let previous = -1;
  for (const rule of node.responsive ?? []) {
    if (rule.minWidth <= previous) throw new Error(`UI ${node.id}: breakpoints must have unique ascending minWidth values.`);
    previous = rule.minWidth;
  }
}
export function captureUiDocument(value: unknown): UiDocument {
  checkTree(value && typeof value === "object" && "root" in value ? value.root : undefined, 0, { nodes: 0 });
  assertUiSchema(value, uiDocumentSchema, "canvas");
  const doc = structuredClone(value) as UiDocument, nodes = flattenUi(doc.root), ids = new Set<string>();
  if (doc.root.kind !== "panel") throw new Error("UI canvas root must be a panel.");
  for (const color of Object.values(doc.theme)) if (color.startsWith("$")) throw new Error("UI theme colors must be literal colors, not token aliases.");
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`UI duplicate node ID ${node.id}.`);
    ids.add(node.id); validateUiNodeValue(node);
    for (const style of [node.style, ...(node.responsive ?? []).map((rule) => rule.style)]) for (const key of ["background", "color", "borderColor"] as const) {
      const color = style?.[key];
      if (color?.startsWith("$") && !Object.prototype.hasOwnProperty.call(doc.theme, color.slice(1))) throw new Error(`UI ${node.id}: unknown theme token ${color}.`);
    }
  }
  for (const id of [doc.navigation?.initialFocus, doc.navigation?.cancel]) {
    const node = nodes.find((item) => item.id === id);
    if (id && (!node || !["button", "input", "toggle", "slider"].includes(node.kind))) throw new Error(`UI navigation target '${id}' must be a control.`);
  }
  if (doc.navigation?.cancel && nodes.find((node) => node.id === doc.navigation!.cancel)?.kind !== "button") throw new Error("UI cancel target must be a button.");
  return doc;
}
export type UiPatch = Partial<Pick<UiNode, "image" | "text" | "label" | "value" | "visible" | "disabled" | "style">>;
export function captureUiPatch(value: UiPatch): UiPatch {
  assertUiSchema(value, { type: "object", properties: Object.fromEntries(["image", "text", "label", "value", "visible", "disabled", "style"].map((key) => [key, uiNodeProperties[key]])), additionalProperties: false }, "patch");
  return structuredClone(value);
}
