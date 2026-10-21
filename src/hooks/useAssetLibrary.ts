import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginAssetLibraryRefresh,
  completeAssetLibraryRefresh,
  createAssetLibraryRefreshState,
  failAssetLibraryRefresh,
  reportAssetLibraryError,
} from "../assets/application/asset-library-refresh-state";
import { deleteAsset, duplicateAsset, listAssets, revealAsset } from "../lib/api";

export function useAssetLibrary() {
  const [state, setState] = useState(createAssetLibraryRefreshState);
  const refreshGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    if (mountedRef.current) {
      setState((current) => beginAssetLibraryRefresh(current, generation));
    }
    try {
      const next = await listAssets();
      if (!mountedRef.current) return;
      setState((current) => completeAssetLibraryRefresh(current, generation, next));
    } catch (caught) {
      if (!mountedRef.current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setState((current) => failAssetLibraryRefresh(current, generation, message));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
      refreshGenerationRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    let connected = false;
    const onReady = () => {
      if (connected) void refresh();
      connected = true;
    };
    const source = new EventSource("/api/asset-database/events");
    window.addEventListener("braze:asset-database-changed", onChanged);
    source.addEventListener("changed", onChanged);
    source.addEventListener("ready", onReady);
    return () => {
      window.removeEventListener("braze:asset-database-changed", onChanged);
      source.close();
    };
  }, [refresh]);

  const remove = useCallback(
    async (filename: string) => {
      try {
        await deleteAsset(filename);
        await refresh();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setState((current) => reportAssetLibraryError(current, message));
      }
    },
    [refresh],
  );

  const duplicate = useCallback(
    async (filename: string) => {
      try {
        const asset = await duplicateAsset(filename);
        await refresh();
        return asset;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setState((current) => reportAssetLibraryError(current, message));
        return null;
      }
    },
    [refresh],
  );

  const reveal = useCallback(async (filename: string) => {
    try {
      await revealAsset(filename);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setState((current) => reportAssetLibraryError(current, message));
    }
  }, []);

  return {
    assets: state.assets,
    error: state.error,
    loaded: state.loaded,
    ready: state.phase === "ready",
    refresh,
    remove,
    duplicate,
    reveal,
  };
}
