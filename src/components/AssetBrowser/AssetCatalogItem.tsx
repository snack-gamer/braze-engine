import { IconAssetTile } from "./IconAssetTile";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { AssetTile, materialSwatch } from "./AssetTile";
import { CharacterAssetTile } from "./CharacterAssetTile";
import { EditTile } from "./EditTile";
import { FolderTile } from "./FolderTile";
import { HdriTile } from "./HdriTile";
import { ImageTile } from "./ImageTile";
import { ModelTile } from "./ModelTile";
import { ModelSubAssetTile } from "./ModelSubAssetTile";
import { PrefabTile } from "./PrefabTile";
import type { AssetCatalogEntry } from "./asset-catalog";
import type { Editing, ItemKey } from "./types";
import { SELECTION_TYPE } from "./drag";

type AssetCatalogItemProps = {
  entry: AssetCatalogEntry;
  editing: Editing;
  selectedKeys: ReadonlySet<ItemKey>;
  focusKey: ItemKey | null;
  focusedMaterialId: string | null;
  expandedModelFilenames: ReadonlySet<string>;
  activeMaterialId?: string | null;
  activeHdriUrl?: string;
  activeObjectName?: string;
  showPreviews: boolean;
  showMaterialPreviews: boolean;
  folderHasContent: (path: string) => boolean;
  onSelect: (key: ItemKey, event: React.MouseEvent) => void;
  onToggleModelExpanded: (filename: string) => void;
  onOpen: (entry: AssetCatalogEntry) => void;
  onRename: (entry: AssetCatalogEntry, name: string) => void;
  onCancelEdit: () => void;
  onDropOnFolder: (event: React.DragEvent, path: string) => void;
};

export function AssetCatalogItem(props: AssetCatalogItemProps) {
  const { entry } = props;
  if (isEditingEntry(props.editing, entry)) {
    return (
      <EditTile
        className={tileClassName(entry)}
        icon={editIcon(entry)}
        initial={entry.displayName}
        onCommit={(name) => props.onRename(entry, name)}
        onCancel={props.onCancelEdit}
      />
    );
  }

  const selected = props.selectedKeys.has(entry.key);
  const focused = props.focusKey === entry.key;
  const onClick = (event: React.MouseEvent) => props.onSelect(entry.key, event);
  const onDoubleClick = () => props.onOpen(entry);

  if (entry.kind === "scene") {
    return <IconAssetTile className="scene-asset-tile" icon="sceneDocument" name={entry.displayName}
      meta={entry.scene.active ? "Active Scene" : "Scene"} selected={selected} focused={focused}
      title={`${entry.displayName} · ${entry.scene.objectCount ?? "?"} objects · Double-click to open`}
      onClick={onClick} onDoubleClick={onDoubleClick} />;
  }
  if (entry.kind === "folder") {
    return (
      <FolderTile
        name={entry.displayName}
        path={entry.path}
        selected={selected}
        focused={focused}
        hasContent={props.folderHasContent(entry.path)}
        onSelect={onClick}
        onOpen={onDoubleClick}
        onAssetDrop={(event) => props.onDropOnFolder(event, entry.path)}
      />
    );
  }
  if (entry.kind === "material") {
    return (
      <AssetTile
        material={entry.material}
        displayName={entry.displayName}
        showPreview={props.showMaterialPreviews}
        selected={selected}
        focused={focused || props.focusedMaterialId === entry.material.id}
        assigned={props.activeMaterialId === entry.material.id}
        activeObjectName={props.activeObjectName}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "model") {
    return (
      <ModelTile
        asset={entry.asset}
        displayName={entry.displayName}
        selected={selected}
        focused={focused}
        showPreview={props.showPreviews}
        expanded={props.expandedModelFilenames.has(entry.asset.filename)}
        onToggleExpanded={() => props.onToggleModelExpanded(entry.asset.filename)}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "modelSubAsset") {
    return (
      <ModelSubAssetTile
        asset={entry.asset}
        subAsset={entry.subAsset}
        selected={selected}
        focused={focused}
        showPreview={props.showPreviews}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "avatarMask") {
    return (
      <CharacterAssetTile
        asset={entry.asset}
        selected={selected}
        focused={focused}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "image") {
    return (
      <ImageTile
        asset={entry.asset}
        displayName={entry.displayName}
        selected={selected}
        focused={focused}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "prefab") {
    return (
      <PrefabTile
        asset={entry.asset}
        displayName={entry.displayName}
        selected={selected}
        focused={focused}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (entry.kind === "font") return <IconAssetTile className="font-asset-tile" icon={assetIconNames.font} name={entry.displayName} meta="Font" selected={selected} focused={focused} onClick={onClick} onDoubleClick={onDoubleClick} onDragStart={(event) => { event.dataTransfer.setData(SELECTION_TYPE, JSON.stringify([{ kind: "font", id: entry.asset.filename }])); event.dataTransfer.effectAllowed = "move"; }} />;
  if (entry.kind === "inputActionMap") return <IconAssetTile className="input-asset-tile"
    icon={assetIconNames.inputActionMap} name={entry.displayName} meta="Input Action Map" selected={selected} focused={focused}
    dataGuid={entry.asset.guid} title={`${entry.displayName} · Input Action Map · Double-click to edit`}
    onClick={onClick} onDoubleClick={onDoubleClick} onDragStart={(event) => {
      event.dataTransfer.setData(SELECTION_TYPE, JSON.stringify([{ kind: entry.kind, id: entry.asset.filename }]));
      event.dataTransfer.effectAllowed = "move";
    }} />;
  if (entry.kind !== "hdri") return null;
  return (
    <HdriTile
      hdri={entry.asset}
      displayName={entry.displayName}
      selected={selected}
      focused={focused}
      active={entry.asset.url === props.activeHdriUrl}
      showPreview={props.showPreviews}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  );
}

function isEditingEntry(editing: Editing, entry: AssetCatalogEntry): boolean {
  if (!editing || entry.kind === "scene") return false;
  if (entry.kind === "folder") return editing.kind === "rename-folder" && editing.path === entry.path;
  if (entry.kind === "material") return editing.kind === "rename-material" && editing.id === entry.material.id;
  if (entry.kind === "model") return editing.kind === "rename-model" && editing.filename === entry.asset.filename;
  if (entry.kind === "modelSubAsset") return false;
  if (entry.kind === "image") return editing.kind === "rename-image" && editing.filename === entry.asset.filename;
  if (entry.kind === "prefab") return editing.kind === "rename-prefab" && editing.filename === entry.asset.filename;
  if (entry.kind === "font") return editing.kind === "rename-font" && editing.filename === entry.asset.filename;
  if (entry.kind === "inputActionMap") return editing.kind === "rename-inputActionMap" && editing.filename === entry.asset.filename;
  if (entry.kind === "avatarMask") {
    return editing.kind === "rename-character-asset"
      && editing.assetKind === "avatarMask"
      && editing.id === entry.asset.id;
  }
  return editing.kind === "rename-hdri" && editing.filename === entry.asset.filename;
}

function tileClassName(entry: AssetCatalogEntry): string {
  if (entry.kind === "folder") return "folder-tile";
  if (entry.kind === "model") return "model-tile";
  if (entry.kind === "modelSubAsset") return "model-subasset-tile";
  if (entry.kind === "image") return "image-tile";
  if (entry.kind === "prefab") return "prefab-tile";
  if (entry.kind === "hdri") return "hdri-tile";
  if (entry.kind === "inputActionMap") return "input-asset-tile";
  if (entry.kind === "avatarMask") return "character-asset-tile";
  return "";
}

function editIcon(entry: AssetCatalogEntry) {
  if (entry.kind === "material") return materialSwatch(entry.material);
  const icon = entry.kind === "folder"
    ? assetIconNames.folder
    : entry.kind === "model"
      ? assetIconNames.model
      : entry.kind === "modelSubAsset"
        ? "object"
      : entry.kind === "avatarMask"
          ? "avatar"
      : entry.kind === "image"
        ? assetIconNames.image
        : entry.kind === "prefab"
          ? assetIconNames.prefab
          : entry.kind === "font" ? assetIconNames.font : entry.kind === "inputActionMap" ? assetIconNames.inputActionMap : assetIconNames.hdri;
  const className = entry.kind === "folder"
    ? "folder-tile__icon"
    : entry.kind === "image"
      ? "image-tile__thumb"
      : entry.kind === "hdri"
        ? "hdri-tile__swatch"
        : `model-tile__icon${entry.kind === "prefab" ? " prefab-tile__icon" : ""}`;
  return <span className={className}><EditorIcon name={icon} size="preview" /></span>;
}
