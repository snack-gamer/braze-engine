import type { UiSession } from "../runtime/ui-session";
import type { UiDocument, UiNode } from "../domain/ui-document";
import { createUiDomNode, type UiDomNode } from "./ui-dom-node";
import { applyUiStyle, UI_BASE_CSS } from "./ui-dom-style";

import { createUiDomAssets } from "./ui-dom-assets";
import { createUiGamepadNavigation } from "./ui-gamepad-navigation";
import type { LibraryAsset } from "../../lib/asset-api";

/** The active Game surface owns only DOM/listeners. Detaching never disposes the Play UI. */
export function attachBrowserUiSurface(session: UiSession, surface: HTMLElement, options: { assets?: readonly LibraryAsset[]; preview?: boolean } = {}) {
  const doc = surface.ownerDocument, view = doc.defaultView!;
  const host = doc.createElement("div"); host.dataset.gameInputIgnore = ""; host.dataset.brazeUi = "";
  const shadow = host.attachShadow({ mode: "open" }), css = doc.createElement("style");
  css.textContent = UI_BASE_CSS; shadow.append(css);
  const originalPosition = surface.style.position;
  if (view.getComputedStyle(surface).position === "static") surface.style.position = "relative";
  surface.append(host);
  const screens = new Map<string, { root: HTMLElement; document: UiDocument; nodes: Map<string, UiDomNode> }>();
  const assets = createUiDomAssets(doc, options.assets ?? []);
  let navigable = false;
  const navigation = createUiGamepadNavigation(surface, shadow, screens, () => navigable && session.isEnabled());
  let width = surface.clientWidth;
  const update = (id: string, nodeId: string) => {
    const screen = screens.get(id), node = session.read(id, nodeId), dom = screen?.nodes.get(nodeId);
    if (!screen || !node || !dom) return;
    dom.sync(node); const style = applyUiStyle(dom.element, node, screen.document, width);
    assets.update(dom.element, node, style);
    dom.element.inert = node.disabled === true;
    if ((node.visible === false || node.disabled) && shadow.activeElement && dom.element.contains(shadow.activeElement)) surface.focus({ preventScroll: true });
  };
  const reconcile = () => {
    const snapshots = session.snapshot(); navigable = snapshots.some((screen) => screen.document.enabled && screen.document.navigation?.enabled);
    const alive = new Set(snapshots.map(({ id }) => id));
    for (const [id, screen] of screens) if (!alive.has(id)) { for (const dom of screen.nodes.values()) assets.release(dom.element); screen.root.remove(); screens.delete(id); }
    for (const snapshot of snapshots) {
      if (!screens.has(snapshot.id)) {
        const root = doc.createElement("section"); root.dataset.uiScreen = snapshot.id;
        root.style.zIndex = String(snapshot.document.order);
        root.style.color = snapshot.document.theme.text ?? "#f5f8ff";
        root.style.font = "16px system-ui,sans-serif";
        root.style.setProperty("--braze-ui-accent", snapshot.document.theme.accent ?? "#72efd1");
        const screen = { root, document: snapshot.document, nodes: new Map<string, UiDomNode>() }; screens.set(snapshot.id, screen);
        const mount = (node: UiNode, parent: HTMLElement) => {
          const dom = createUiDomNode(doc, node, (value) => session.dispatch(snapshot.id, node.id, value));
          screen.nodes.set(node.id, dom); parent.append(dom.element);
          for (const child of node.children ?? []) mount(child, dom.element);
          update(snapshot.id, node.id);
        };
        mount(snapshot.document.root, root); shadow.append(root);
      }
      const screen = screens.get(snapshot.id)!;
      screen.root.hidden = !snapshot.document.enabled;
      screen.root.inert = !options.preview && !session.isEnabled();
      if (!session.isEnabled()) navigation.reset();
    }
  };
  const unsubscribe = session.subscribe(({ screenId, nodeId }) => { if (nodeId) update(screenId, nodeId); else reconcile(); });
  const observer = new ResizeObserver(() => {
    const nextWidth = surface.clientWidth; if (nextWidth === width) return; width = nextWidth;
    for (const [id, screen] of screens) for (const nodeId of screen.nodes.keys()) update(id, nodeId);
  });
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => session.setReducedMotion(motion.matches);
  motion.addEventListener("change", reduced); reduced(); observer.observe(surface); reconcile();
  return Object.assign(() => { navigation.dispose(); assets.dispose(); unsubscribe(); observer.disconnect(); motion.removeEventListener("change", reduced); host.remove(); screens.clear(); surface.style.position = originalPosition; }, { advance: navigation.advance, inspect: () => ({
    focused: shadow.activeElement?.closest<HTMLElement>("[data-ui-node]")?.dataset.uiNode ?? null,
    resources: [...shadow.querySelectorAll<HTMLElement>("[data-ui-image],[data-ui-font]")].slice(0, 200).map((element) => ({
      screenId: element.closest<HTMLElement>("[data-ui-screen]")?.dataset.uiScreen, nodeId: element.dataset.uiNode,
      ...(element.dataset.uiImage ? { image: element.dataset.uiImage } : {}), ...(element.dataset.uiFont ? { font: element.dataset.uiFont } : {}),
    })),
  }) });
}
