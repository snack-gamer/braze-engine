import type { AssetRef } from "../../assets/domain/asset-reference";
import type { LibraryAsset } from "../../lib/asset-api";
import type { UiNode, UiStyle } from "../domain/ui-document";

let serial = 0;
/** One surface owns its font faces and image listeners; stable references resolve only at attach. */
export function createUiDomAssets(doc: Document, assets: readonly LibraryAsset[]) {
  const catalog = new Map(assets.map((asset) => [asset.guid?.toLowerCase(), asset]));
  const fonts = new Map<string, { face: FontFace; family: string; state: string; elements: Set<HTMLElement> }>();
  const images = new Map<HTMLImageElement, { key: string; clear: () => void }>();
  const fontBindings = new Map<HTMLElement, string>();
  const prefix = `BrazeUI${++serial}`;
  let ended = false;
  const resolve = (ref: AssetRef | undefined, kind: "image" | "font") => {
    const asset = ref && catalog.get(ref.guid.toLowerCase());
    if (!asset || ref?.localId && ref.localId !== "main" || asset.kind !== kind || asset.status === "missing" || asset.status === "failed") return;
    const url = new URL(asset.url, doc.baseURI);
    // Project sources only; a forged catalog cannot fetch arbitrary origins or executable schemes.
    if (url.origin !== new URL(doc.baseURI).origin || !url.pathname.includes("/3d-models/")) return;
    if (!(kind === "font" ? /\.(woff2?|ttf|otf)$/i : /\.(png|jpe?g|webp|gif|bmp)$/i).test(url.pathname)) return;
    url.searchParams.set("uiRevision", asset.contentRevision ?? String(asset.updatedAt ?? ""));
    return { key: `${ref!.guid}:${url.href}`, url: url.href };
  };
  const releaseFont = (element: HTMLElement) => {
    const key = fontBindings.get(element), record = key && fonts.get(key);
    if (record) { record.elements.delete(element); if (!record.elements.size) { doc.fonts.delete(record.face); fonts.delete(key); } }
    fontBindings.delete(element);
  };
  const release = (element: HTMLElement) => {
    releaseFont(element);
    const image = images.get(element as HTMLImageElement); image?.clear(); images.delete(element as HTMLImageElement);
  };
  return {
    update(element: HTMLElement, node: UiNode, style: UiStyle) {
      if (ended) return;
      if (node.kind === "image") {
        const image = element as HTMLImageElement, asset = resolve(node.image, "image"), key = asset?.key ?? "missing";
        if (images.get(image)?.key !== key) {
          images.get(image)?.clear(); image.removeAttribute("src"); image.dataset.uiImage = asset ? "loading" : "missing";
          image.title = asset ? "" : "Missing image asset. Choose an imported image or restore its source and metadata.";
          const loaded = () => { if (!ended && images.get(image)?.key === key) image.dataset.uiImage = "ready"; };
          const failed = () => { if (!ended && images.get(image)?.key === key) { image.dataset.uiImage = "failed"; image.title = "Image failed to load. Check the source asset."; } };
          image.addEventListener("load", loaded); image.addEventListener("error", failed);
          images.set(image, { key, clear: () => { image.removeEventListener("load", loaded); image.removeEventListener("error", failed); image.removeAttribute("src"); } });
          if (asset) image.src = asset.url;
        }
      }
      const asset = resolve(style.font, "font");
      if (fontBindings.get(element) !== asset?.key) releaseFont(element);
      if (!asset) { delete element.dataset.uiFont; if (style.font) element.dataset.uiFont = "missing"; return; }
      let record = fonts.get(asset.key);
      if (!record) {
        const family = `${prefix}_${fonts.size}_${++serial}`;
        const face = new FontFace(family, `url(${JSON.stringify(asset.url)})`);
        record = { face, family, state: "loading", elements: new Set() }; fonts.set(asset.key, record);
        const owned = record;
        void face.load().then(() => {
          if (ended || fonts.get(asset.key) !== owned) return;
          doc.fonts.add(face); owned.state = "ready";
          for (const item of owned.elements) item.dataset.uiFont = "ready";
        }, () => {
          if (ended || fonts.get(asset.key) !== owned) return;
          owned.state = "failed"; for (const item of owned.elements) item.dataset.uiFont = "failed";
        });
      }
      record.elements.add(element); fontBindings.set(element, asset.key);
      element.style.fontFamily = `"${record.family}",system-ui,sans-serif`; element.dataset.uiFont = record.state;
    },
    release,
    dispose() { if (ended) return; ended = true; for (const element of [...fontBindings.keys(), ...images.keys()]) release(element); fonts.clear(); catalog.clear(); },
  };
}
