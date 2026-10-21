import type { ItemKey } from "./types";

export function selectAssetRange(
  orderedKeys: readonly ItemKey[],
  anchorKey: ItemKey | null,
  focusKey: ItemKey | null,
  targetKey: ItemKey,
): Set<ItemKey> {
  const fromKey = anchorKey ?? focusKey ?? targetKey;
  const from = orderedKeys.indexOf(fromKey);
  const to = orderedKeys.indexOf(targetKey);
  if (from < 0 || to < 0) return new Set([targetKey]);
  const lower = Math.min(from, to);
  const upper = Math.max(from, to);
  return new Set(orderedKeys.slice(lower, upper + 1));
}
