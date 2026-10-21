import type { UiDocument, UiKind, UiNode } from "../domain/ui-document";
import { captureUiDocument } from "../domain/ui-validation";

export type UiEdit =
  | { op: "patch"; id: string; patch: Partial<UiNode> }
  | { op: "add"; parentId: string; kind: UiKind }
  | { op: "remove"; id: string }
  | { op: "move"; id: string; parentId: string; index: number };
/** All tree changes validate a complete candidate before reaching scene history. */
export function editUiDocument(document: UiDocument, edit: UiEdit): UiDocument {
  const next = structuredClone(document), nodes = new Map<string, UiNode>(), parents = new Map<string, UiNode>();
  const visit = (node: UiNode) => { nodes.set(node.id, node); for (const child of node.children ?? []) { parents.set(child.id, node); visit(child); } };
  visit(next.root);
  if (edit.op === "patch") {
    const node = nodes.get(edit.id); if (!node) throw new Error(`Unknown UI node ${edit.id}.`);
    for (const [key, value] of Object.entries(edit.patch)) {
      if (value === undefined) delete (node as unknown as Record<string, unknown>)[key];
      else Object.assign(node, { [key]: value });
    }
  } else if (edit.op === "add") {
    const parent = nodes.get(edit.parentId); if (parent?.kind !== "panel") throw new Error("Add UI elements inside a panel.");
    let suffix = 1; while (nodes.has(`${edit.kind}${suffix}`)) suffix++;
    const child: UiNode = { id: `${edit.kind}${suffix}`, kind: edit.kind,
      ...(["button", "input", "slider", "toggle"].includes(edit.kind) ? { action: `${edit.kind}${suffix}` } : {}),
      ...(edit.kind === "panel" ? { style: { layout: "column", gap: 12, padding: 16, background: "$surface", radius: 12 }, children: [] }
        : { text: edit.kind === "text" ? "Text" : edit.kind, ...(edit.kind === "button" ? { action: `${edit.kind}${suffix}`, style: { background: "$accent", color: "#102031", radius: 8 } } : {}) }),
      ...(["slider", "progress"].includes(edit.kind) ? { value: 0, min: 0, max: 1 } : edit.kind === "input" ? { value: "" } : edit.kind === "toggle" ? { value: false } : {}),
    };
    Object.assign(parent, { children: [...parent.children ?? [], child] });
  } else {
    if (edit.id === next.root.id) throw new Error("The UI root cannot be removed or moved.");
    const node = nodes.get(edit.id), parent = parents.get(edit.id); if (!node || !parent) throw new Error(`Unknown UI node ${edit.id}.`);
    Object.assign(parent, { children: parent.children!.filter((child) => child.id !== edit.id) });
    if (edit.op === "move") {
      const target = nodes.get(edit.parentId);
      if (target?.kind !== "panel" || !Number.isInteger(edit.index) || edit.index < 0) throw new Error("UI move needs a panel and nonnegative insertion index.");
      let ancestor: UiNode | undefined = target;
      while (ancestor) { if (ancestor === node) throw new Error("UI panels cannot contain themselves."); ancestor = parents.get(ancestor.id); }
      const children = [...target.children ?? []]; children.splice(edit.index, 0, node); Object.assign(target, { children });
    }
  }
  return captureUiDocument(next);
}
