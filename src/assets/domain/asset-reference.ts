/**
 * A durable authored reference to a project asset and optional sub-asset.
 * Mirrors Unity's `{ guid, fileID }` model with a readable local sub-asset key.
 * URLs remain a temporary runtime or migration fallback, not project identity.
 */
export type AssetRef = {
  guid: string;
  localId?: string;
};
