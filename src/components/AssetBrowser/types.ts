import type { LibraryAsset } from "../../lib/api";
import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import type { Material, SceneObject } from "../../types";
import type { ProjectCharacterAssetBridge } from "../../character/application/useProjectCharacterAssets";

export type ViewMode = "grid" | "list";
export type AssetFilter = "all" | "scenes" | "models" | "images" | "fonts" | "textures" | "materials" | "prefabs" | "animation" | "input" | "hdris" | "favorites" | "recent";

/** Encodes the kind and stable asset identity, for example `model:path/file.glb`. */
export type ItemKey = string;

export type FocusedLibraryAsset =
  | { kind: "model" | "image" | "prefab" | "hdri" | "inputActionMap" | "font"; asset: LibraryAsset; localId?: string }
  | null;

export type Editing =
  | { kind: "create-folder"; parent: FolderPath }
  | { kind: "rename-folder"; path: FolderPath }
  | { kind: "rename-material"; id: string }
  | { kind: "rename-model"; filename: string }
  | { kind: "rename-image"; filename: string }
  | { kind: "rename-prefab"; filename: string }
  | { kind: "rename-hdri"; filename: string }
  | { kind: "rename-inputActionMap"; filename: string }
  | { kind: "rename-font"; filename: string }
  | { kind: "rename-character-asset"; assetKind: "avatarMask"; id: string }
  | null;

export type AssetBrowserMenu =
  | { kind: "empty"; x: number; y: number }
  | { kind: "folder"; x: number; y: number; path: FolderPath }
  | { kind: "item"; x: number; y: number; itemKind: AssetKind; id: string; name: string; activeScene?: boolean };

export type PendingDelete = {
  title: string;
  message: string;
  run: () => void;
};

export type AssetBrowserProps = {
  materials: Material[];
  characterAssets: ProjectCharacterAssetBridge;
  openAvatarMask: (id: string) => void;
  openProjectInput: () => void;
  focusedMaterialId: string | null;
  setFocusedMaterialId: (id: string | null) => void;
  createMaterial: () => string;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  duplicateMaterial: (id: string) => string | null;
  removeMaterial: (id: string) => void;
  activeObject: SceneObject | undefined;
  objects: SceneObject[];
  assignMaterialToObject: (objectId: string, materialId: string | null) => void;
  models: LibraryAsset[];
  images: LibraryAsset[];
  prefabs: LibraryAsset[];
  inputActionMaps: LibraryAsset[];
  removeInputActionMap: (filename: string) => void;
  addModelToScene: (asset: LibraryAsset) => void;
  addImageToScene: (asset: LibraryAsset) => void;
  addPrefabToScene: (asset: LibraryAsset) => void;
  removeModel: (filename: string) => void;
  removeImage: (filename: string) => void;
  removePrefab: (filename: string) => void;
  duplicateModel: (filename: string) => Promise<LibraryAsset | null>;
  duplicateImage: (filename: string) => Promise<LibraryAsset | null>;
  duplicatePrefab: (filename: string) => Promise<LibraryAsset | null>;
  revealModel: (filename: string) => void;
  revealImage: (filename: string) => void;
  revealPrefab: (filename: string) => void;
  refreshAssets: () => void;
  savePrefabFromObjects: (ids: string[]) => Promise<LibraryAsset | null>;
  importAssetFiles: (files: FileList | File[] | null, destination?: FolderPath) => Promise<LibraryAsset[]>;
  hdris: LibraryAsset[];
  activeHdriUrl?: string;
  applyHdri: (asset: LibraryAsset) => void;
  removeHdri: (filename: string) => void;
  duplicateHdri: (filename: string) => Promise<LibraryAsset | null>;
  revealHdri: (filename: string) => void;
  refreshHdris: () => void;
  uploadHdri: (file: File) => Promise<LibraryAsset | null>;
  onAssetFocus?: (asset: FocusedLibraryAsset) => void;
  onPrefabDisplayNameChange?: (filename: string, displayName: string) => void;
  prefabModeActive?: boolean;
};
