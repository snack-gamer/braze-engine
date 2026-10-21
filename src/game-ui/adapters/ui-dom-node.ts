import type { UiNode } from "../domain/ui-document";

export type UiDomNode = Readonly<{ element: HTMLElement; sync: (node: UiNode) => void }>;
export function createUiDomNode(doc: Document, node: UiNode, dispatch: (value?: string | number | boolean) => void): UiDomNode {
  const control = ["input", "slider", "toggle", "progress"].includes(node.kind);
  const element = doc.createElement(control ? "label" : node.kind === "button" ? "button" : node.kind === "image" ? "img" : "div");
  element.dataset.uiNode = node.id;
  let field: HTMLInputElement | HTMLProgressElement | undefined, caption: HTMLSpanElement | undefined;
  if (control) {
    caption = doc.createElement("span"); element.append(caption);
    if (node.kind === "progress") field = doc.createElement("progress");
    else {
      const input = doc.createElement("input"); field = input;
      input.type = node.kind === "slider" ? "range" : node.kind === "toggle" ? "checkbox" : "text";
      input.maxLength = 4096;
      input.addEventListener(node.kind === "toggle" ? "change" : "input", () => dispatch(node.kind === "toggle" ? input.checked : node.kind === "slider" ? input.valueAsNumber : input.value));
    }
    element.append(field);
  } else if (node.kind === "button") {
    (element as HTMLButtonElement).type = "button";
    element.addEventListener("click", () => dispatch());
  }
  return { element, sync(current) {
    if (current.kind === "image") { (element as HTMLImageElement).alt = current.label ?? ""; (element as HTMLImageElement).draggable = false; }
    if (!["panel", "image"].includes(current.kind) && !control) element.textContent = current.text ?? current.label ?? "";
    const label = current.label ?? current.text ?? current.id;
    if (current.kind === "button") { (element as HTMLButtonElement).disabled = current.disabled === true; element.setAttribute("aria-label", label); }
    if (!field || !caption) return;
    caption.textContent = label; field.setAttribute("aria-label", label);
    if (field instanceof HTMLProgressElement) { field.max = (current.max ?? 1) - (current.min ?? 0); field.value = Number(current.value ?? current.min ?? 0) - (current.min ?? 0); }
    else {
      field.disabled = current.disabled === true;
      field.min = String(current.min ?? 0); field.max = String(current.max ?? 1); field.step = String(current.step ?? 0.01);
      if (current.kind === "toggle") field.checked = current.value === true;
      else if (field.value !== String(current.value ?? "")) field.value = String(current.value ?? "");
    }
  } };
}
