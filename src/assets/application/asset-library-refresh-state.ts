import type { LibraryAsset } from "../../lib/api";

export type AssetLibraryRefreshState = Readonly<{
  assets: LibraryAsset[];
  error: string;
  loaded: boolean;
  generation: number;
  phase: "pending" | "ready" | "error";
}>;

export function createAssetLibraryRefreshState(): AssetLibraryRefreshState {
  return {
    assets: [],
    error: "",
    loaded: false,
    generation: 0,
    phase: "pending",
  };
}

export function beginAssetLibraryRefresh(
  state: AssetLibraryRefreshState,
  generation: number,
): AssetLibraryRefreshState {
  return {
    ...state,
    error: "",
    generation,
    phase: "pending",
  };
}

export function completeAssetLibraryRefresh(
  state: AssetLibraryRefreshState,
  generation: number,
  assets: LibraryAsset[],
): AssetLibraryRefreshState {
  if (generation !== state.generation) return state;
  return {
    assets,
    error: "",
    loaded: true,
    generation,
    phase: "ready",
  };
}

export function failAssetLibraryRefresh(
  state: AssetLibraryRefreshState,
  generation: number,
  error: string,
): AssetLibraryRefreshState {
  if (generation !== state.generation) return state;
  return {
    ...state,
    error,
    loaded: true,
    phase: "error",
  };
}

export function reportAssetLibraryError(
  state: AssetLibraryRefreshState,
  error: string,
): AssetLibraryRefreshState {
  return { ...state, error };
}
