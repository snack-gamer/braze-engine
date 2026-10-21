import type { AssetRef } from "../../assets/domain/asset-reference";
import type { InputActionMap } from "./action-map";

export { INPUT_ACTION_MAP_ASSET_VERSION, INPUT_ACTION_MAP_ASSET_SUFFIX, INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "./input-action-map-asset-identity.mjs";

export type InputActionMapAsset = Readonly<{
  version: "braze/input-action-map-v1";
  name: string;
  map: InputActionMap;
}>;

export type ProjectInputSettings = Readonly<{ version: 1; actionMap?: Readonly<AssetRef> }>;
export type CapturedProjectInput = Readonly<{
  asset: Readonly<AssetRef>;
  revision: string;
  document: InputActionMapAsset;
}>;
