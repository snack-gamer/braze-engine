import type { AssetRef } from "../../assets/domain/asset-reference";

/** Resolved at Play/build from the Asset Database, never persisted as asset identity. */
export type RuntimePrefabResources = Readonly<{
  models: readonly Readonly<{ asset: Readonly<AssetRef>; url: string; primitive: "gltf" | "fbx" | "usdz"; importSettings: unknown }>[];
  materials: readonly unknown[];
  /** Saved transport metadata; decoded by the host before Animator resolution. */
  animation?: Readonly<{
    importedAssets: readonly unknown[];
    characterAssets: unknown;
    modelImportDocuments: Readonly<Record<string, unknown>>;
  }>;
}>;
