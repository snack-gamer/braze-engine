import { afterEach, expect, it, vi } from "vitest";
import { createUiDomAssets } from "./ui-dom-assets";
import type { LibraryAsset } from "../../lib/asset-api";
class ElementStub extends EventTarget {
  dataset: Record<string, string> = {}; style: Record<string, string> = {}; title = ""; src = "";
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
}
afterEach(() => vi.unstubAllGlobals());
it("shares owned font faces, releases the last binding and ignores late completion", async () => {
  const loads: { face: unknown; finish: () => void }[] = [];
  vi.stubGlobal("FontFace", class { load() { return new Promise((resolve) => loads.push({ face: this, finish: () => resolve(this) })); } });
  const owned = new Set(), doc = { baseURI: "http://localhost/player.html", fonts: { add: vi.fn((face) => owned.add(face)), delete: vi.fn((face) => owned.delete(face)) } };
  const guid = "a".repeat(32), catalog = [{ kind: "font", guid, url: "./3d-models/renamed.ttf", filename: "renamed.ttf" }] as LibraryAsset[];
  const resources = createUiDomAssets(doc as unknown as Document, catalog);
  const first = new ElementStub() as unknown as HTMLElement, second = new ElementStub() as unknown as HTMLElement;
  for (const element of [first, second]) resources.update(element, { id: "text", kind: "text" }, { font: { guid } });
  expect(loads).toHaveLength(1); loads[0].finish(); await Promise.resolve(); expect(owned.size).toBe(1);
  resources.release(first); expect(owned.size).toBe(1); resources.release(second); expect(owned.size).toBe(0);
  resources.update(first, { id: "text", kind: "text" }, { font: { guid } });
  resources.dispose(); loads[1].finish(); await Promise.resolve(); expect(owned.size).toBe(0); expect(doc.fonts.add).toHaveBeenCalledTimes(1);
});
it("reports missing or external references and removes stale image callbacks", () => {
  const doc = { baseURI: "http://localhost/player.html", fonts: { delete() {} } } as unknown as Document;
  const guid = "a".repeat(32), catalog = [{ kind: "image", guid, url: "/3d-models/art.png", filename: "art.png" }] as LibraryAsset[];
  const resources = createUiDomAssets(doc, catalog), image = new ElementStub();
  resources.update(image as unknown as HTMLElement, { id: "art", kind: "image", image: { guid } }, {});
  image.dispatchEvent(new Event("load")); expect(image.dataset.uiImage).toBe("ready");
  resources.update(image as unknown as HTMLElement, { id: "art", kind: "image", image: { guid: "b".repeat(32) } }, {});
  expect(image.src).toBe(""); expect(image.dataset.uiImage).toBe("missing");
  resources.dispose(); image.dispatchEvent(new Event("load")); expect(image.dataset.uiImage).toBe("missing");
});
