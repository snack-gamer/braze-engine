import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";
import { useCallback, useMemo, type CSSProperties } from "react";
import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import { AssetBrowserCatalogView } from "./AssetBrowserCatalogView";
import { AssetBrowserHeader } from "./AssetBrowserHeader";
import { AssetBrowserOverlays } from "./AssetBrowserOverlays";
import { AssetBrowserWorkspace } from "./AssetBrowserWorkspace";
import type { AssetCatalogEntry } from "./asset-catalog";
import { useProjectAssetCatalog } from "./useProjectAssetCatalog";
import { useSceneWorkspace } from "../../scene/components/SceneWorkspaceContext";
import { assetCatalogEntryIdentity, assetCatalogRenameTarget } from "./asset-catalog-entry";
import { buildCrumbs } from "./model";
import type { AssetBrowserProps, ItemKey } from "./types";
import { useAssetDeletion } from "./useAssetDeletion";
import { useAssetDropController } from "./useAssetDropController";
import { useAssetFocusBridge } from "./useAssetFocusBridge";
import { useAssetFolderView } from "./useAssetFolderView";
import { useAssetKeyboardCommands } from "./useAssetKeyboardCommands";
import { useAssetMenuCommands } from "./useAssetMenuCommands";
import { useAssetSelection } from "./useAssetSelection";
import { useAssetBrowserViewState } from "./useAssetBrowserViewState";
import { useProjectAssetMaintenance } from "./useProjectAssetMaintenance";
import { useModelAssetExpansion } from "./useModelAssetExpansion";
import { useAssetAuthoringCommands } from "./useAssetAuthoringCommands";
import { modelSubAssetKey } from "./model-subasset-catalog";

export type { FocusedLibraryAsset } from "./types";

export function AssetBrowser(props: AssetBrowserProps) {
  const importedAssets = useImportedAssetCatalog();
  const fonts = useMemo(() => importedAssets.filter((asset) => asset.kind === "font"), [importedAssets]);
  const physicalAssetPaths = useMemo(
    () => [...props.models, ...props.images, ...props.prefabs, ...props.inputActionMaps, ...fonts].map((asset) => asset.filename),
    [props.images, props.models, props.prefabs, props.inputActionMaps, fonts],
  );
  const folderView = useAssetFolderView({
    physicalAssetPaths,
    materials: props.materials,
    avatarMasks: props.characterAssets.avatarMasks,
    models: props.models,
    images: props.images,
    prefabs: props.prefabs,
    inputActionMaps: props.inputActionMaps, fonts,
    hdris: props.hdris,
  });
  const { folders, path } = folderView;
  const view = useAssetBrowserViewState();
  const modelExpansion = useModelAssetExpansion(props.models);
  const {
    tileSize, setTileSize, search, setSearch, assetFilter, setAssetFilter,
    viewMode, setViewMode, editing, setEditing, menu, setMenu,
    setFavorites, setRecent, favoriteSet, recentSet,
  } = view;
  const scenes = useSceneWorkspace();
  const catalog = useProjectAssetCatalog({
    path,
    search,
    filter: assetFilter,
    subfolders: folderView.subfolders,
    materials: props.materials,
    avatarMasks: props.characterAssets.avatarMasks,
    models: props.models,
    images: props.images,
    prefabs: props.prefabs,
    inputActionMaps: props.inputActionMaps, fonts,
    hdris: props.hdris,
    favoriteKeys: favoriteSet,
    recentKeys: recentSet,
    expandedModelFilenames: modelExpansion.expanded,
    folders,
  });
  const orderedKeys = useMemo(() => catalog.map((entry) => entry.key), [catalog]);
  const selection = useAssetSelection(orderedKeys);

  const markRecent = useCallback((key: ItemKey) => {
    setRecent((previous) => [key, ...previous.filter((item) => item !== key)].slice(0, 24));
  }, [setRecent]);
  const toggleFavorite = useCallback((key: ItemKey) => {
    setFavorites((previous) => previous.includes(key)
      ? previous.filter((item) => item !== key)
      : [key, ...previous]);
  }, [setFavorites]);
  const openFolder = useCallback((folderPath: FolderPath) => {
    folderView.setPath(folderPath);
    selection.clearBrowseSelection();
  }, [folderView.setPath, selection.clearBrowseSelection]);
  const browseFolder = useCallback((folderPath: FolderPath) => {
    setSearch("");
    setAssetFilter("all");
    openFolder(folderPath);
  }, [openFolder, setAssetFilter]);

  const beginRename = useCallback((kind: "folder" | AssetKind, id: string) => {
    if (kind === "scene") { scenes?.showSceneDialog(id, "rename"); return; }
    setEditing(assetCatalogRenameTarget(kind, id));
  }, [scenes]);
  const beginCreateFolder = useCallback((parent: FolderPath) => {
    if (parent !== path) openFolder(parent);
    setEditing({ kind: "create-folder", parent });
  }, [openFolder, path]);
  const authoring = useAssetAuthoringCommands({
    folders, path, focusOne: selection.focusOne, finishEditing: setEditing,
    createMaterial: props.createMaterial, updateMaterial: props.updateMaterial,
    duplicateMaterial: props.duplicateMaterial, characterAssets: props.characterAssets,
    onPrefabDisplayNameChange: props.onPrefabDisplayNameChange, refreshAssets: props.refreshAssets,
  });

  const revealMaterial = useCallback((id: string) => {
    const target = folders.folderOf("material", id);
    if (target !== path) folderView.setPath(target);
    setSearch("");
    if (assetFilter !== "all" && assetFilter !== "materials") setAssetFilter("all");
    selection.selectOne(`material:${id}`);
  }, [assetFilter, folderView.setPath, folders, path, selection.selectOne, setAssetFilter, setSearch]);
  const revealImage = useCallback((filename: string) => {
    const target = folders.folderOf("image", filename);
    if (target !== path) folderView.setPath(target);
    if (assetFilter !== "all" && assetFilter !== "images" && assetFilter !== "textures") setAssetFilter("all");
    selection.focusOne(`image:${filename}`);
  }, [assetFilter, folderView.setPath, folders, path, selection.focusOne, setAssetFilter]);
  const revealModelSubAsset = useCallback((filename: string, localId: string) => {
    setSearch("");
    setAssetFilter("animation");
    modelExpansion.expand(filename);
    selection.focusOne(modelSubAssetKey(filename, localId));
  }, [modelExpansion.expand, selection.focusOne, setAssetFilter, setSearch]);
  useAssetFocusBridge({
    editorFocus: selection.editorFocus,
    models: props.models,
    images: props.images,
    prefabs: props.prefabs,
    inputActionMaps: props.inputActionMaps, fonts,
    hdris: props.hdris,
    setFocusedMaterialId: props.setFocusedMaterialId,
    onAssetFocus: props.onAssetFocus,
    onRevealMaterial: revealMaterial,
    onRevealImage: revealImage,
    onRevealModelSubAsset: revealModelSubAsset,
  });

  const deletion = useAssetDeletion({
    folders,
    materials: props.materials,
    models: props.models,
    images: props.images,
    prefabs: props.prefabs,
    inputActionMaps: props.inputActionMaps, fonts,
    hdris: props.hdris,
    avatarMasks: props.characterAssets.avatarMasks,
    objects: props.objects,
    activeHdriUrl: props.activeHdriUrl,
    removeMaterial: props.removeMaterial,
    removeModel: props.removeModel,
    removeImage: props.removeImage,
    removePrefab: props.removePrefab,
    removeInputActionMap: props.removeInputActionMap,
    removeHdri: props.removeHdri,
    removeAvatarMask: props.characterAssets.removeMask,
    clearBrowseSelection: selection.clearBrowseSelection,
  });
  const drop = useAssetDropController({
    path,
    folders,
    selectedKeys: selection.selectedKeys,
    setSelectedKeys: selection.setSelectedKeys,
    setFocusKey: selection.setFocusKey,
    setAnchorKey: selection.setAnchorKey,
    focusOne: selection.focusOne,
    markRecent,
    importAssetFiles: props.importAssetFiles,
    uploadHdri: props.uploadHdri,
    savePrefabFromObjects: props.savePrefabFromObjects,
  });
  const commands = useAssetMenuCommands({
    menu,
    path,
    folders,
    selectedKeys: selection.selectedKeys,
    models: props.models,
    images: props.images,
    prefabs: props.prefabs,
    inputActionMaps: props.inputActionMaps, fonts,
    hdris: props.hdris,
    characterAssets: props.characterAssets,
    activeObjectId: props.activeObject?.id,
    modelUploadRef: drop.modelUploadRef,
    imageUploadRef: drop.imageUploadRef,
    onOpenFolder: openFolder,
    onCreateFolder: beginCreateFolder,
    onRename: beginRename,
    onNewMaterial: authoring.createMaterial,
    onNewAvatarMask: authoring.createAvatarMask,
    onNewInputActionMap: authoring.createInputActionMap,
    onProjectInputSettings: props.openProjectInput,
    onOpenAvatarMask: props.openAvatarMask,
    onOpenFolderImport: () => drop.setFolderImportOpen(true),
    onImportHdri: () => drop.hdriUploadRef.current?.click(),
    onRequestDelete: deletion.requestDelete,
    collectSelection: deletion.collectSelection,
    focusOne: selection.focusOne,
    markRecent,
    toggleFavorite,
    duplicateMaterial: props.duplicateMaterial,
    duplicateModel: props.duplicateModel,
    duplicateImage: props.duplicateImage,
    duplicatePrefab: props.duplicatePrefab,
    duplicateHdri: props.duplicateHdri,
    addModelToScene: props.addModelToScene,
    addImageToScene: props.addImageToScene,
    addPrefabToScene: props.addPrefabToScene,
    applyHdri: props.applyHdri,
    assignMaterial: (materialId) => {
      if (props.activeObject) props.assignMaterialToObject(props.activeObject.id, materialId);
    },
    revealModel: props.revealModel,
    revealImage: props.revealImage,
    revealPrefab: props.revealPrefab,
    revealHdri: props.revealHdri,
    refreshAssets: props.refreshAssets,
    refreshHdris: props.refreshHdris,
  });


  useAssetKeyboardCommands({
    editing: Boolean(editing),
    deleteConfirmationOpen: Boolean(deletion.pendingDelete),
    selectedKeys: selection.selectedKeys,
    focusKey: selection.focusKey,
    collectSelection: deletion.collectSelection,
    requestDelete: deletion.requestDelete,
    onRename: beginRename,
    onDuplicateFocusedMaterial: authoring.duplicateFocusedMaterial,
  });

  const resetForPrefabMode = useCallback(() => {
    setSearch("");
    setAssetFilter("all");
    selection.clearAll();
    setMenu(null);
    setEditing(null);
    props.setFocusedMaterialId(null);
    props.onAssetFocus?.(null);
  }, [props.onAssetFocus, props.setFocusedMaterialId, selection.clearAll, setAssetFilter]);
  useProjectAssetMaintenance({
    folders,
    materials: props.materials,
    prefabModeActive: props.prefabModeActive ?? false,
    onEnterPrefabMode: resetForPrefabMode,
  });

  const handleEmptyContext = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    selection.selectOne(null);
    setMenu({ kind: "empty", x: event.clientX, y: event.clientY });
  }, [selection.selectOne]);
  const handleItemContext = useCallback((event: React.MouseEvent, entry: AssetCatalogEntry) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry.kind === "modelSubAsset") {
      selection.focusOne(entry.key);
      setMenu(null);
      return;
    }
    if (!selection.selectedKeys.has(entry.key)) selection.selectOne(entry.key);
    setMenu(entry.kind === "folder"
      ? { kind: "folder", x: event.clientX, y: event.clientY, path: entry.path }
      : { kind: "item", x: event.clientX, y: event.clientY, itemKind: entry.kind, id: assetCatalogEntryIdentity(entry), name: entry.displayName, activeScene: entry.kind === "scene" && entry.scene.active });
  }, [selection.selectOne, selection.selectedKeys]);

  const swatchSize = Math.round(tileSize * 0.7);
  const panelStyle = { "--tile-size": `${tileSize}px`, "--swatch-size": `${swatchSize}px` } as CSSProperties;

  return (
    <aside className="rail assets" aria-label="Project" style={panelStyle}>
      <AssetBrowserHeader
        destinationLabel={path ? `Assets/${path}` : "Assets"}
        search={search}
        onSearchChange={setSearch}
        assetFilter={assetFilter}
        onAssetFilterChange={setAssetFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        tileSize={tileSize}
        onTileSizeChange={setTileSize}
        hdriUploadRef={drop.hdriUploadRef}
        modelUploadRef={drop.modelUploadRef}
        imageUploadRef={drop.imageUploadRef}
        onUploadHdri={(file) => void drop.importHdriIntoCurrentFolder(file)}
        onImportAssetFiles={(files) => void drop.importFilesIntoCurrentFolder(files)}
        onOpenMenu={setMenu}
      />
      {(authoring.error || deletion.error) && <p role="alert">{authoring.error || deletion.error}</p>}
      <AssetBrowserWorkspace
        sidebar={{
          assetFilter,
          path,
          folderDropHover: drop.folderDropHover,
          expandedFolders: folderView.expandedFolderSet,
          nonEmptyFolders: folderView.nonEmptyFolders,
          folderChildren: folderView.folderChildren,
          basenameOf: folders.basenameOf,
          onSelectFilter: (filter) => {
            setSearch("");
            setAssetFilter(filter);
          },
          onBrowseFolder: browseFolder,
          onToggleFolder: folderView.toggleFolderExpanded,
          onFolderContext: (event, folderPath) => handleItemContext(event, {
            kind: "folder",
            key: `folder:${folderPath}`,
            path: folderPath,
            displayName: folders.basenameOf(folderPath),
          }),
          onRootContext: handleEmptyContext,
          onDropHover: drop.setFolderDropHover,
          onDropOnFolder: drop.handleAssetDropOnFolder,
        }}
        crumbs={buildCrumbs(path)}
        folderDropHover={drop.folderDropHover}
        itemCount={catalog.length}
        onBrowseFolder={browseFolder}
        onDropHover={drop.setFolderDropHover}
        onDropOnFolder={drop.handleAssetDropOnFolder}
      >
        <AssetBrowserCatalogView
          catalog={catalog}
          path={path}
          search={search}
          filter={assetFilter}
          viewMode={viewMode}
          tileSize={tileSize}
          swatchSize={swatchSize}
          editing={editing}
          selectedKeys={selection.selectedKeys}
          focusKey={selection.focusKey}
          focusedMaterialId={props.focusedMaterialId}
          expandedModelFilenames={modelExpansion.expanded}
          activeMaterialId={props.activeObject?.materialId}
          activeHdriUrl={props.activeHdriUrl}
          activeObjectName={props.activeObject?.name}
          favoriteKeys={favoriteSet}
          draggingKeys={drop.draggingAssetKeys}
          dropActive={drop.assetPanelDropActive}
          folderHasContent={(folderPath) => folderView.nonEmptyFolders.has(folderPath)}
          onCreateFolder={(name) => {
            folders.createFolder(path, name);
            setEditing(null);
          }}
          onSelect={selection.handleTileClick}
          onToggleModelExpanded={modelExpansion.toggle}
          onOpen={commands.activateEntry}
          onRename={authoring.renameEntry}
          onCancelEdit={() => setEditing(null)}
          onDropOnFolder={drop.handleAssetDropOnFolder}
          onItemContextMenu={handleItemContext}
          onItemDragStart={drop.handleTileDragStart}
          onItemDragEnd={drop.clearAssetDragging}
          onEmptyContextMenu={handleEmptyContext}
          onEmptyClick={() => selection.selectOne(null)}
          onDragOver={drop.handlePanelDragOver}
          onDragLeave={drop.handlePanelDragLeave}
          onDrop={drop.handlePanelDrop}
        />
      </AssetBrowserWorkspace>
      <AssetBrowserOverlays
        menu={menu}
        selectedKeys={selection.selectedKeys}
        favoriteKeys={favoriteSet}
        basenameOf={folders.basenameOf}
        onMenuSelect={commands.handleMenuSelect}
        onCloseMenu={() => setMenu(null)}
        pendingDelete={deletion.pendingDelete}
        onConfirmDelete={deletion.confirmDelete}
        onCancelDelete={deletion.cancelDelete}
        folderImportOpen={drop.folderImportOpen}
        folderImportBusy={drop.folderImportBusy}
        folderImportDropActive={drop.folderImportDropActive}
        onFolderImportDropActive={drop.setFolderImportDropActive}
        onChooseFolderFiles={() => drop.modelUploadRef.current?.click()}
        onFolderImportDrop={(dataTransfer) => void drop.importDroppedModelFolder(dataTransfer)}
        onCloseFolderImport={() => {
          if (drop.folderImportBusy) return;
          drop.setFolderImportOpen(false);
          drop.setFolderImportDropActive(false);
        }}
      />
    </aside>
  );
}
