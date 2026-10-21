import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryAsset } from "../../lib/api";
import { importedModelSubAssets } from "./model-subasset-catalog";

/** Owns the Project window's explicitly expanded compound models. */
export function useModelAssetExpansion(models: readonly LibraryAsset[]) {
  const expandable = useMemo(() => new Set(models.flatMap((asset) => (
    importedModelSubAssets(asset).length > 0 ? [asset.filename] : []
  ))), [models]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => setExpanded((previous) => {
    const next = new Set([...previous].filter((filename) => expandable.has(filename)));
    return next.size === previous.size ? previous : next;
  }), [expandable]);

  const toggle = useCallback((filename: string) => setExpanded((previous) => {
    if (!expandable.has(filename)) return previous;
    const next = new Set(previous);
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    return next;
  }), [expandable]);
  const expand = useCallback((filename: string) => setExpanded((previous) => {
    if (!expandable.has(filename) || previous.has(filename)) return previous;
    const next = new Set(previous);
    next.add(filename);
    return next;
  }), [expandable]);
  return { expanded, expand, toggle };
}
