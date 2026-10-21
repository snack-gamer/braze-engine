import { useEffect, useRef } from "react";
import type { LibraryAsset } from "../../lib/api";
import type { FocusedLibraryAsset, ItemKey } from "./types";
import { splitKey } from "./model";
import { parseModelSubAssetKey } from "./model-subasset-catalog";
import { subscribeProjectModelSubAssetFocus } from "../../assets/application/project-asset-focus-channel";

type AssetFocusBridgeInput = {
  editorFocus: Readonly<{ key: ItemKey }> | null;
  models: readonly LibraryAsset[];
  images: readonly LibraryAsset[];
  prefabs: readonly LibraryAsset[];
  hdris: readonly LibraryAsset[];
  fonts?: readonly LibraryAsset[];
  inputActionMaps: readonly LibraryAsset[];
  setFocusedMaterialId: (id: string | null) => void;
  onAssetFocus?: (asset: FocusedLibraryAsset) => void;
  onRevealMaterial: (id: string) => void;
  onRevealImage: (filename: string) => void;
  onRevealModelSubAsset: (filename: string, localId: string) => void;
};

/** Bridges explicit Project-window opens to the right-rail editor and reveal events. */
export function useAssetFocusBridge(input: AssetFocusBridgeInput) {
  const previous = useRef<{ key: ItemKey; asset: LibraryAsset } | null>(null);
  useEffect(() => {
    const editorKey = input.editorFocus?.key;
    if (editorKey?.startsWith("material:")) {
      input.setFocusedMaterialId(editorKey.slice("material:".length));
      input.onAssetFocus?.(null);
      return;
    }
    input.setFocusedMaterialId(null);
    if (!editorKey) {
      input.onAssetFocus?.(null);
      return;
    }
    const modelSubAsset = parseModelSubAssetKey(editorKey);
    if (modelSubAsset) {
      const asset = input.models.find((item) => item.filename === modelSubAsset.filename);
      input.onAssetFocus?.(asset ? { kind: "model", asset, localId: modelSubAsset.localId } : null);
      return;
    }
    const [kind, id] = splitKey(editorKey);
    if (kind === "avatarMask") {
      input.onAssetFocus?.(null);
      return;
    }
    const source = kind === "model"
      ? input.models
      : kind === "image"
        ? input.images
        : kind === "prefab"
          ? input.prefabs
          : kind === "hdri"
            ? input.hdris
            : kind === "inputActionMap" ? input.inputActionMaps : kind === "font" ? input.fonts ?? [] : [];
    const remembered = previous.current?.key === editorKey ? previous.current.asset : undefined;
    const moved = remembered?.guid ? source.filter((item) => item.guid?.toLowerCase() === remembered.guid!.toLowerCase()) : [];
    const asset = source.find((item) => item.filename === id) ?? (moved.length === 1 ? moved[0] : undefined);
    if (asset) previous.current = { key: editorKey, asset };
    input.onAssetFocus?.(asset && (kind === "model" || kind === "image" || kind === "prefab" || kind === "hdri" || kind === "inputActionMap" || kind === "font")
      ? { kind, asset }
      : null);
  }, [input.editorFocus, input.fonts, input.inputActionMaps, input.hdris, input.images, input.models, input.onAssetFocus, input.prefabs, input.setFocusedMaterialId]);

  useEffect(() => {
    return subscribeProjectModelSubAssetFocus(({ filename, localId }) => {
      input.onRevealModelSubAsset(filename, localId);
    });
  }, [input.onRevealModelSubAsset]);

  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) input.onRevealMaterial(id);
    };
    window.addEventListener("tgan:focus-material", handler);
    return () => window.removeEventListener("tgan:focus-material", handler);
  }, [input.onRevealMaterial]);

  useEffect(() => {
    const handler = (event: Event) => {
      const filename = (event as CustomEvent<{ filename?: string }>).detail?.filename;
      if (filename) input.onRevealImage(filename);
    };
    window.addEventListener("tgan:focus-image", handler);
    return () => window.removeEventListener("tgan:focus-image", handler);
  }, [input.onRevealImage]);
}
