import { createElement } from "lucide";
import { editorIcons, type EditorIconName } from "./icons";
import { editorIconClassName, type EditorIconSize } from "./editor-icon-style";

/** DOM adapter for embedded editors, using exactly the React glyph geometry. */
export function createEditorIconElement(name: EditorIconName, size: EditorIconSize = "control"): SVGSVGElement {
  const element = createElement(editorIcons[name]) as SVGSVGElement;
  element.setAttribute("data-icon", name);
  element.setAttribute("class", editorIconClassName(size));
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("focusable", "false");
  return element;
}
