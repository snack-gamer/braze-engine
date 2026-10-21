import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";
import { useEffect, useRef, useState } from "react";
import type { UiDocument } from "../domain/ui-document";
import { createUiSession } from "../runtime/ui-session";
import { attachBrowserUiSurface } from "../adapters/browser-ui-surface";

/** Same renderer as Play, with a simulated Game width and no gameplay callbacks. */
export function UiPreview({ document, selected, onSelect }: { document: UiDocument; selected?: string; onSelect: (id: string) => void }) {
  const assets = useImportedAssetCatalog();
  const viewport = useRef<HTMLDivElement>(null), frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640), [available, setAvailable] = useState(280);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(frame.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!viewport.current) return;
    const session = createUiSession(); session.port.create("preview", document);
    const detach = attachBrowserUiSurface(session, viewport.current, { assets, preview: true });
    const shadow = viewport.current.querySelector("[data-braze-ui]")!.shadowRoot!;
    const style = window.document.createElement("style");
    style.textContent = `[data-ui-node]{pointer-events:auto!important;cursor:crosshair!important}[data-preview-selected]{outline:3px solid #56c6ff!important;outline-offset:-3px}`;
    shadow.append(style);
    const select = (event: Event) => { event.preventDefault(); event.stopPropagation(); const element = (event.target as Element).closest<HTMLElement>("[data-ui-node]"); if (element?.dataset.uiNode) onSelect(element.dataset.uiNode); };
    shadow.addEventListener("pointerdown", select, true);
    if (selected) for (const element of shadow.querySelectorAll<HTMLElement>("[data-ui-node]")) if (element.dataset.uiNode === selected) element.dataset.previewSelected = "";
    return () => { shadow.removeEventListener("pointerdown", select, true); detach(); session.dispose(); };
  }, [document, assets, selected, onSelect]);
  return <div className="ui-canvas-preview">
    <label>Preview width <select aria-label="UI preview width" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
      {[320, 640, 1024, 1440].map((size) => <option key={size} value={size}>{size} px</option>)}
    </select></label>
    <div ref={frame} className="ui-canvas-preview__frame" style={{ height: available * 0.625 }}>
      <div ref={viewport} style={{ position: "absolute", width, height: width * 0.625, transform: `scale(${available / width})`, transformOrigin: "top left" }} />
    </div>
  </div>;
}
