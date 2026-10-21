import { useCallback, useState } from "react";
import { selectAssetRange } from "./asset-selection";
import type { ItemKey } from "./types";

export function useAssetSelection(orderedKeys: readonly ItemKey[]) {
  const [selectedKeys, setSelectedKeys] = useState<Set<ItemKey>>(new Set());
  const [focusKey, setFocusKey] = useState<ItemKey | null>(null);
  const [editorFocus, setEditorFocus] = useState<Readonly<{ key: ItemKey }> | null>(null);
  const [anchorKey, setAnchorKey] = useState<ItemKey | null>(null);

  const selectOne = useCallback((key: ItemKey | null) => {
    if (!key) {
      setSelectedKeys(new Set());
      setFocusKey(null);
      setAnchorKey(null);
      setEditorFocus(null);
      return;
    }
    setSelectedKeys(new Set([key]));
    setFocusKey(key);
    setAnchorKey(key);
  }, []);

  const focusOne = useCallback((key: ItemKey) => {
    setSelectedKeys(new Set([key]));
    setFocusKey(key);
    setAnchorKey(key);
    setEditorFocus({ key });
  }, []);

  const toggleOne = useCallback((key: ItemKey) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setFocusKey(key);
    setAnchorKey(key);
  }, []);

  const selectRange = useCallback((key: ItemKey) => {
    setSelectedKeys(selectAssetRange(orderedKeys, anchorKey, focusKey, key));
    setFocusKey(key);
  }, [anchorKey, focusKey, orderedKeys]);

  const handleTileClick = useCallback((key: ItemKey, event: React.MouseEvent) => {
    if (event.shiftKey) selectRange(key);
    else if (event.metaKey || event.ctrlKey) toggleOne(key);
    else focusOne(key);
  }, [focusOne, selectRange, toggleOne]);

  const clearBrowseSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setFocusKey(null);
    setAnchorKey(null);
  }, []);

  const clearAll = useCallback(() => {
    clearBrowseSelection();
    setEditorFocus(null);
  }, [clearBrowseSelection]);

  return {
    selectedKeys,
    setSelectedKeys,
    focusKey,
    setFocusKey,
    editorFocus,
    setAnchorKey,
    selectOne,
    focusOne,
    handleTileClick,
    clearBrowseSelection,
    clearAll,
  };
}
