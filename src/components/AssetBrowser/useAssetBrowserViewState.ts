import { useMemo, useState } from "react";
import { ASSET_FILTERS, TILE_DEFAULT, TILE_MAX, TILE_MIN } from "./model";
import { isStringArray, usePersistedJson, usePersistedNumber, usePersistedString } from "./preferences";
import type { AssetBrowserMenu, AssetFilter, Editing, ItemKey, ViewMode } from "./types";

/** Owns Project-window view preferences separately from asset-domain commands. */
export function useAssetBrowserViewState() {
  const [tileSize, setTileSize] = usePersistedNumber(
    "tgan.materialTileSize",
    TILE_DEFAULT,
    TILE_MIN,
    TILE_MAX,
  );
  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = usePersistedString<AssetFilter>(
    "tgan.assetFilter",
    "all",
    (value): value is AssetFilter => ASSET_FILTERS.some((filter) => filter.id === value),
  );
  const [viewMode, setViewMode] = usePersistedString<ViewMode>(
    "tgan.assetsViewMode",
    "grid",
    (value): value is ViewMode => value === "grid" || value === "list",
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [menu, setMenu] = useState<AssetBrowserMenu | null>(null);
  const [favorites, setFavorites] = usePersistedJson<ItemKey[]>("tgan.assetFavorites", [], isStringArray);
  const [recent, setRecent] = usePersistedJson<ItemKey[]>("tgan.assetRecent", [], isStringArray);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const recentSet = useMemo(() => new Set(recent), [recent]);
  return {
    tileSize,
    setTileSize,
    search,
    setSearch,
    assetFilter,
    setAssetFilter,
    viewMode,
    setViewMode,
    editing,
    setEditing,
    menu,
    setMenu,
    setFavorites,
    setRecent,
    favoriteSet,
    recentSet,
  };
}
