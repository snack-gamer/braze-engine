import type { UiDocument, UiNode, UiStyle } from "../domain/ui-document";

const lengths = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "left", "right", "top", "bottom"] as const;
const pixels = ["gap", "padding", "borderWidth", "borderRadius", "fontSize"] as const;
export function applyUiStyle(element: HTMLElement, node: UiNode, document: UiDocument, viewportWidth: number) {
  let value: UiStyle = { ...node.style };
  for (const rule of node.responsive ?? []) if (viewportWidth >= rule.minWidth) value = { ...value, ...rule.style };
  const style = element.style;
  style.cssText = "";
  style.display = node.visible === false ? "none" : node.kind === "panel" ? value.layout === "grid" || value.layout === "overlay" ? "grid" : "flex" : "block";
  style.position = value.position === "absolute" ? "absolute" : "relative";
  style.flexDirection = value.layout === "row" ? "row" : "column";
  style.flexWrap = value.wrap ? "wrap" : "nowrap";
  style.flexGrow = String(value.grow ?? 0); style.flexShrink = "1";
  style.alignItems = value.align ?? "stretch"; style.justifyContent = value.justify ?? "start";
  if (value.layout === "grid") style.gridTemplateColumns = value.cellMin
    ? `repeat(auto-fit,minmax(min(100%,${value.cellMin}px),1fr))` : `repeat(${value.columns ?? 2},minmax(0,1fr))`;
  if (value.layout === "overlay") style.gridTemplate = "1fr / 1fr";
  for (const key of lengths) if (value[key] !== undefined) style[key] = typeof value[key] === "number" ? `${value[key]}px` : String(value[key]);
  const dimensions = { gap: value.gap, padding: value.padding, borderWidth: value.borderWidth, borderRadius: value.radius, fontSize: value.fontSize };
  for (const key of pixels) if (dimensions[key] !== undefined) style[key] = `${dimensions[key]}px`;
  const color = (input: string | undefined, fallback: string) => input?.startsWith("$") ? document.theme[input.slice(1)] : input ?? fallback;
  style.color = color(value.color, "inherit"); style.backgroundColor = color(value.background, "transparent");
  style.borderColor = color(value.borderColor, "transparent"); style.borderStyle = "solid";
  style.fontWeight = String(value.fontWeight ?? 400); style.textAlign = value.textAlign ?? "left";
  style.overflow = value.overflow ?? "visible"; style.opacity = String(value.opacity ?? 1);
  style.transform = `translate(${value.x ?? 0}px,${value.y ?? 0}px) rotate(${value.rotate ?? 0}deg) scale(${value.scale ?? 1})`;
  style.pointerEvents = value.pointer === "block" || !["panel", "text", "image", "progress"].includes(node.kind) ? "auto" : "none";
  style.objectFit = value.fit ?? "contain";
  element.dataset.layout = value.layout ?? "column";
  return value;
}

/** Isolated game styles: editor themes, page button styles and CSS resets cannot leak in. */
export const UI_BASE_CSS = `
:host{position:absolute;inset:0;z-index:8;pointer-events:none;display:block;isolation:isolate;overflow:hidden}
*,*::before,*::after{box-sizing:border-box}section{position:absolute;inset:0;pointer-events:none;overflow:hidden}
[data-ui-node]{min-width:0;min-height:0;margin:0;border:0;padding:0;font:inherit;line-height:1.35;overflow-wrap:anywhere}
[data-layout=overlay]>[data-ui-node]{grid-area:1/1}
button,input{font:inherit}button{cursor:pointer;min-height:40px!important;padding:8px 16px!important;text-align:center!important;touch-action:manipulation}
button:hover:not(:disabled){filter:brightness(1.16)}button:active:not(:disabled){filter:brightness(.9)}
button:disabled,input:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid currentColor;outline-offset:3px}
input:not([type=checkbox]){display:block;width:100%;min-width:0;min-height:32px}input[type=text]{background:#ffffff18;color:inherit;border:1px solid currentColor;border-radius:6px;padding:8px}
input[type=range],input[type=checkbox],progress{accent-color:var(--braze-ui-accent,#72efd1)}
progress{display:block;width:100%;height:12px}label>span{display:block;margin-bottom:4px}input[type=checkbox]{width:20px;height:20px}
`;
