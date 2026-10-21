import { useCallback, useRef, useState } from "react";
import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import { useAssetFolders } from "../../hooks/useAssetFolders";
import type { LibraryAsset } from "../../lib/api";
import {
  SELECTION_TYPE,
  extractAssetMoves,
  extractHierarchyRows,
  hasAssetDragPayload,
  hasExternalFiles,
  type AssetMove,
} from "./drag";
import { collectDroppedFiles } from "./file-drop";
import { libraryAssetKind, splitKey } from "./model";
import type { AssetCatalogEntry } from "./asset-catalog";
import type { ItemKey } from "./types";

type AssetDropControllerInput = {
  path: FolderPath;
  folders: ReturnType<typeof useAssetFolders>;
  selectedKeys: ReadonlySet<ItemKey>;
  setSelectedKeys: (keys: Set<ItemKey>) => void;
  setFocusKey: (key: ItemKey | null) => void;
  setAnchorKey: (key: ItemKey | null) => void;
  focusOne: (key: ItemKey) => void;
  markRecent: (key: ItemKey) => void;
  importAssetFiles: (files: FileList | File[] | null, destination?: FolderPath) => Promise<LibraryAsset[]>;
  uploadHdri: (file: File) => Promise<LibraryAsset | null>;
  savePrefabFromObjects: (ids: string[]) => Promise<LibraryAsset | null>;
};

export function useAssetDropController(input: AssetDropControllerInput) {
  const [folderDropHover, setFolderDropHover] = useState<FolderPath | null>(null);
  const [draggingAssetKeys, setDraggingAssetKeys] = useState<Set<ItemKey>>(new Set());
  const [assetPanelDropActive, setAssetPanelDropActive] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [folderImportDropActive, setFolderImportDropActive] = useState(false);
  const [folderImportBusy, setFolderImportBusy] = useState(false);
  const hdriUploadRef = useRef<HTMLInputElement | null>(null);
  const modelUploadRef = useRef<HTMLInputElement | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);

  const rememberImportedAsset = useCallback((asset: LibraryAsset) => {
    const kind = libraryAssetKind(asset);
    if (kind) input.markRecent(`${kind}:${asset.filename}`);
  }, [input.markRecent]);

  const importFilesIntoCurrentFolder = useCallback(async (files: FileList | File[] | null) => {
    const uploaded = await input.importAssetFiles(files, input.path);
    for (const asset of uploaded) rememberImportedAsset(asset);
    if (uploaded.length > 0) setFolderImportOpen(false);
  }, [input.importAssetFiles, input.path, rememberImportedAsset]);

  const importDroppedModelFolder = useCallback(async (dataTransfer: DataTransfer) => {
    setFolderImportBusy(true);
    try {
      const files = await collectDroppedFiles(dataTransfer);
      await importFilesIntoCurrentFolder(files);
    } finally {
      setFolderImportDropActive(false);
      setFolderImportBusy(false);
    }
  }, [importFilesIntoCurrentFolder]);

  const importHdriIntoCurrentFolder = useCallback(async (file: File) => {
    const uploaded = await input.uploadHdri(file);
    if (!uploaded) return;
    input.folders.moveItem("hdri", uploaded.filename, input.path);
    input.markRecent(`hdri:${uploaded.filename}`);
  }, [input.folders, input.markRecent, input.path, input.uploadHdri]);

  const handleTileDragStart = useCallback((event: React.DragEvent, entry: AssetCatalogEntry) => {
    if (entry.kind === "scene") { event.preventDefault(); return; }
    if (entry.kind === "folder") return;
    let effective = new Set(input.selectedKeys);
    if (!effective.has(entry.key)) {
      effective = new Set([entry.key]);
      input.setSelectedKeys(effective);
      input.setFocusKey(entry.key);
      input.setAnchorKey(entry.key);
    }
    setDraggingAssetKeys(new Set(effective));
    if (effective.size <= 1) return;
    const moves: AssetMove[] = [];
    for (const key of effective) {
      const [kind, id] = splitKey(key);
      if (isMovableKind(kind)) moves.push({ kind, id });
    }
    if (moves.length === 0) return;
    try {
      event.dataTransfer.setData(SELECTION_TYPE, JSON.stringify(moves));
      event.dataTransfer.effectAllowed = "copyMove";
    } catch {
      // The inner tile already provides a valid single-asset payload.
    }
  }, [input]);

  const clearAssetDragging = useCallback(() => setDraggingAssetKeys(new Set()), []);

  const handleAssetDropOnFolder = useCallback((event: React.DragEvent, target: FolderPath) => {
    clearAssetDragging();
    if (event.dataTransfer.files.length > 0) {
      event.preventDefault();
      void input.importAssetFiles(event.dataTransfer.files, target).then((uploaded) => {
        for (const asset of uploaded) rememberImportedAsset(asset);
      });
      return;
    }
    const hierarchyIds = extractHierarchyRows(event.dataTransfer);
    if (hierarchyIds.length > 0) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      void input.savePrefabFromObjects(hierarchyIds).then((asset) => {
        if (!asset) return;
        input.folders.moveItem("prefab", asset.filename, target);
        input.markRecent(`prefab:${asset.filename}`);
        input.focusOne(`prefab:${asset.filename}`);
      });
      return;
    }
    const moves = extractAssetMoves(event.dataTransfer);
    if (moves.length === 0) return;
    event.preventDefault();
    for (const move of moves) input.folders.moveItem(move.kind, move.id, target);
  }, [clearAssetDragging, input, rememberImportedAsset]);

  const handlePanelDragOver = useCallback((event: React.DragEvent) => {
    const files = hasExternalFiles(event.dataTransfer);
    if (!files && !hasAssetDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = files ? "copy" : "move";
    setAssetPanelDropActive(true);
  }, []);

  const handlePanelDragLeave = useCallback((event: React.DragEvent) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) setAssetPanelDropActive(false);
  }, []);

  const handlePanelDrop = useCallback((event: React.DragEvent) => {
    setAssetPanelDropActive(false);
    handleAssetDropOnFolder(event, input.path);
  }, [handleAssetDropOnFolder, input.path]);

  return {
    folderDropHover,
    setFolderDropHover,
    draggingAssetKeys,
    assetPanelDropActive,
    folderImportOpen,
    setFolderImportOpen,
    folderImportDropActive,
    setFolderImportDropActive,
    folderImportBusy,
    hdriUploadRef,
    modelUploadRef,
    imageUploadRef,
    importFilesIntoCurrentFolder,
    importHdriIntoCurrentFolder,
    importDroppedModelFolder,
    handleTileDragStart,
    clearAssetDragging,
    handleAssetDropOnFolder,
    handlePanelDragOver,
    handlePanelDragLeave,
    handlePanelDrop,
  };
}

function isMovableKind(kind: "folder" | AssetKind): kind is AssetKind {
  return kind === "material"
    || kind === "model"
    || kind === "image"
    || kind === "prefab"
    || kind === "hdri"
    || kind === "avatarMask"
    || kind === "inputActionMap" || kind === "font";
}
