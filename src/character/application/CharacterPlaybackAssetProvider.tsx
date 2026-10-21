import { ImportedAssetCatalogProvider } from "../../assets/application/ImportedAssetCatalogProvider";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LibraryAsset } from "../../lib/asset-api";
import { usePublishAnimatorWorldCatalog } from "../adapters/three/usePublishAnimatorWorldCatalog";
import type { CharacterAssetLibrary } from "../domain/character-asset-library";

export type CharacterPlaybackAssetCatalog = Readonly<{
  library: CharacterAssetLibrary;
  importedAssets: readonly LibraryAsset[];
  ready: boolean;
}>;

const CharacterPlaybackAssetContext = createContext<CharacterPlaybackAssetCatalog | null>(null);

type CharacterPlaybackAssetProviderProps = Readonly<{
  library: CharacterAssetLibrary;
  importedAssets: readonly LibraryAsset[];
  ready: boolean;
  children: ReactNode;
}>;

/** Read-only asset resolver shared by editor Play Mode and exported players. */
export function CharacterPlaybackAssetProvider({
  library,
  importedAssets,
  ready,
  children,
}: CharacterPlaybackAssetProviderProps) {
  const value = useMemo(() => ({ library, importedAssets, ready }), [
    importedAssets,
    library,
    ready,
  ]);
  usePublishAnimatorWorldCatalog(value);
  return (
    <CharacterPlaybackAssetContext.Provider value={value}>
      <ImportedAssetCatalogProvider assets={importedAssets}>{children}</ImportedAssetCatalogProvider>
    </CharacterPlaybackAssetContext.Provider>
  );
}

export function useCharacterPlaybackAssetCatalog(): CharacterPlaybackAssetCatalog {
  const value = useContext(CharacterPlaybackAssetContext);
  if (!value) throw new Error("Character playback assets require CharacterPlaybackAssetProvider.");
  return value;
}
