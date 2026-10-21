import { createContext, useContext, type ReactNode } from "react";
import type { LibraryAsset } from "../../lib/asset-api";
const empty: readonly LibraryAsset[] = Object.freeze([]);
const Context = createContext<readonly LibraryAsset[]>(empty);
/** Shared, read-only imported asset catalog for editor and player features. */
export function ImportedAssetCatalogProvider({ assets, children }: { assets: readonly LibraryAsset[]; children: ReactNode }) {
  return <Context.Provider value={assets}>{children}</Context.Provider>;
}
export const useImportedAssetCatalog = () => useContext(Context);
