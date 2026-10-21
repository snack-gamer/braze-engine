import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LibraryAsset } from "../../lib/asset-api";
import type { CharacterAssetLibrary } from "../domain/character-asset-library";
import {
  useCharacterAssetLibrary,
  type CharacterAssetLibraryController,
} from "./useCharacterAssetLibrary";
import { CharacterPlaybackAssetProvider } from "./CharacterPlaybackAssetProvider";

type CharacterAssetLibraryContextValue = {
  authoring: CharacterAssetLibraryController;
  importedCatalog: ImportedCharacterAssetCatalog;
  publishImportedAssets: (assets: readonly LibraryAsset[], ready: boolean) => void;
};

type ImportedCharacterAssetCatalog = Readonly<{
  assets: readonly LibraryAsset[];
  ready: boolean;
}>;

const INITIAL_IMPORTED_CATALOG: ImportedCharacterAssetCatalog = Object.freeze({
  assets: Object.freeze([]),
  ready: false,
});

const CharacterAssetLibraryContext = createContext<CharacterAssetLibraryContextValue | null>(null);

export function CharacterAssetLibraryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const authoring = useCharacterAssetLibrary();
  const [importedCatalog, setImportedCatalog] = useState<ImportedCharacterAssetCatalog>(
    INITIAL_IMPORTED_CATALOG,
  );
  const publishImportedAssets = useCallback((assets: readonly LibraryAsset[], ready: boolean) => {
    setImportedCatalog((current) => (
      current.assets === assets && current.ready === ready ? current : { assets, ready }
    ));
  }, []);
  const value = useMemo(() => ({ authoring, importedCatalog, publishImportedAssets }), [
    authoring,
    importedCatalog,
    publishImportedAssets,
  ]);
  return (
    <CharacterAssetLibraryContext.Provider value={value}>
      <CharacterPlaybackAssetProvider
        library={authoring.library}
        importedAssets={importedCatalog.assets}
        ready={authoring.readyForPlayback && importedCatalog.ready}
      >
        {children}
      </CharacterPlaybackAssetProvider>
    </CharacterAssetLibraryContext.Provider>
  );
}

function useCharacterAssetLibraryContext(): CharacterAssetLibraryContextValue {
  const value = useContext(CharacterAssetLibraryContext);
  if (!value) throw new Error("Character assets must be used inside CharacterAssetLibraryProvider.");
  return value;
}

/** Full mutation surface for character authoring screens. */
export function useCharacterAssetAuthoring(): CharacterAssetLibraryController {
  return useCharacterAssetLibraryContext().authoring;
}

/** Narrow, read-only snapshot for playback and resolution adapters. */
export function useCharacterAssetLibrarySnapshot(): CharacterAssetLibrary {
  return useCharacterAssetLibraryContext().authoring.library;
}

export function usePublishCharacterImportedAssets(
  assets: readonly LibraryAsset[],
  ready: boolean,
): void {
  const publish = useCharacterAssetLibraryContext().publishImportedAssets;
  useEffect(() => publish(assets, ready), [assets, publish, ready]);
}

export { useCharacterPlaybackAssetCatalog } from "./CharacterPlaybackAssetProvider";
