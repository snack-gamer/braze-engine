import { useEffect, useRef } from "react";
import type { AssetKind } from "../../hooks/useAssetFolders";
import { splitKey } from "./model";
import type { AssetDeleteItem } from "./useAssetDeletion";
import type { ItemKey } from "./types";

type AssetKeyboardCommandsInput = {
  editing: boolean;
  deleteConfirmationOpen: boolean;
  selectedKeys: ReadonlySet<ItemKey>;
  focusKey: ItemKey | null;
  collectSelection: (keys: ReadonlySet<ItemKey>) => AssetDeleteItem[];
  requestDelete: (items: AssetDeleteItem[]) => void;
  onRename: (kind: "folder" | AssetKind, id: string) => void;
  onDuplicateFocusedMaterial: (id: string) => void;
};

/** Owns Project-window keyboard commands and their panel-focus boundary. */
export function useAssetKeyboardCommands(input: AssetKeyboardCommandsInput) {
  const focusInAssetsRef = useRef(false);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      focusInAssetsRef.current = Boolean(target?.closest(".assets, .asset-menu, .confirm-modal"));
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable || input.editing || input.deleteConfirmationOpen || !focusInAssetsRef.current) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (input.selectedKeys.size === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        input.requestDelete(input.collectSelection(input.selectedKeys));
        return;
      }
      if (event.key === "F2" && input.focusKey) {
        const [kind, id] = splitKey(input.focusKey);
        event.preventDefault();
        event.stopImmediatePropagation();
        input.onRename(kind, id);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && input.focusKey?.startsWith("material:")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.onDuplicateFocusedMaterial(input.focusKey.slice("material:".length));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [input]);
}
