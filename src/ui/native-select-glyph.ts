import { createEditorIconElement } from "./editor-icon-element";
import { readEditorColorToken, readEditorNumberToken } from "./theme-tokens";

/** Native selects retain native menus; only their closed-field arrow is shared. */
export function configureNativeSelectGlyph(): void {
  const glyph = createEditorIconElement("disclosureOpen", "disclosure");
  glyph.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  glyph.setAttribute("stroke", readEditorColorToken("--text-2", "#aaa"));
  glyph.setAttribute("stroke-width", String(readEditorNumberToken("--icon-stroke-regular", 1.5)));
  document.documentElement.style.setProperty("--editor-select-arrow-image", `url("data:image/svg+xml,${encodeURIComponent(glyph.outerHTML)}")`);
}
