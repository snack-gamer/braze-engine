import { useCallback, useMemo, useState, type DragEvent } from "react";
import { trailingHierarchyDropTarget } from "../hierarchy-drop";
import { canDeleteHierarchySelection, flattenHierarchyRows } from "../hierarchy-model";
import type { Material, PrimitiveKind, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { HierarchyAddMenu } from "./HierarchyAddMenu";
import { HierarchyContextMenu } from "./HierarchyContextMenu";
import { HierarchyDensityButton } from "./HierarchyDensityButton";
import { HierarchyList } from "./HierarchyList";
import { useHierarchyDensity } from "../hooks/useHierarchyDensity";
import { useHierarchySelection } from "../hooks/useHierarchySelection";

type HierarchyPanelProps = {
  objects: SceneObject[];
  activeObjectId: string;
  activeCameraId: string;
  viewThroughCameraId?: string | null;
  setActiveObjectId: (id: string) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  moveObject: (sourceId: string, targetId: string, position: "before" | "after" | "child") => void;
  lookThroughCamera: (id: string) => void;
  alignCameraToView: (id: string) => void;
  setActiveCamera: (id: string) => void;
  deleteObjects: (ids: string[]) => void;
  duplicateObjects: (ids: string[]) => void;
  createEmpty: (parentId?: string) => void;
  createEmptyParent: (ids: string[]) => void;
  frameObject: (id: string) => void;
  materials: Material[];
  assignMaterialToObject: (objectId: string, materialId: string | null) => void;
  addAssetToHierarchy: (asset: { url: string; name: string; filename: string; guid?: string }) => void;
  addPrimitive: (kind: PrimitiveKind) => void;
  addCamera: () => void;
  requireCamera?: boolean;
  lockedRootId?: string | null;
};

type HierarchyMenu = { objectId: string; x: number; y: number };

function assetPayloadFromDrop(event: DragEvent): {
  url: string;
  name: string;
  filename: string;
  guid?: string;
} | null {
  try {
    const value: unknown = JSON.parse(event.dataTransfer.getData("application/x-tgan-asset"));
    if (!value || typeof value !== "object") return null;
    const payload = value as Record<string, unknown>;
    if (!payload.url || typeof payload.url !== "string" || !payload.filename || typeof payload.filename !== "string") {
      return null;
    }
    return {
      url: payload.url,
      name: typeof payload.name === "string" && payload.name ? payload.name : payload.filename,
      filename: payload.filename,
      guid: typeof payload.guid === "string" ? payload.guid : undefined,
    };
  } catch {
    return null;
  }
}

export function HierarchyPanel(props: HierarchyPanelProps) {
  const {
    objects,
    activeObjectId,
    activeCameraId,
    viewThroughCameraId = null,
    setActiveObjectId,
    updateObject,
    moveObject,
    lookThroughCamera,
    alignCameraToView,
    setActiveCamera,
    deleteObjects,
    duplicateObjects,
    createEmpty,
    createEmptyParent,
    frameObject,
    materials,
    assignMaterialToObject,
    addAssetToHierarchy,
    addPrimitive,
    addCamera,
    requireCamera = true,
    lockedRootId = null,
  } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [menu, setMenu] = useState<HierarchyMenu | null>(null);
  const [assetDropActive, setAssetDropActive] = useState(false);
  const { density, toggleDensity } = useHierarchyDensity();
  const rows = useMemo(
    () => flattenHierarchyRows(objects, collapsed, searchQuery),
    [collapsed, objects, searchQuery],
  );
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
  const trailingDropTarget = useMemo(
    () => trailingHierarchyDropTarget(objects, lockedRootId),
    [lockedRootId, objects],
  );
  const setObjectCollapsed = useCallback((id: string, nextCollapsed: boolean) => {
    setCollapsed((current) => {
      if (current.has(id) === nextCollapsed) return current;
      const next = new Set(current);
      if (nextCollapsed) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selection = useHierarchySelection({
    objects,
    rows,
    activeObjectId,
    lockedRootId,
    collapsed,
    setObjectCollapsed,
    setActiveObjectId,
    updateObject,
    duplicateObjects,
    deleteObjects,
    frameObject,
  });
  const menuObject = menu ? objectById.get(menu.objectId) ?? null : null;
  const menuSelectionIds = menu ? selection.idsForRowAction(menu.objectId) : [];
  const closeMenu = useCallback(() => setMenu(null), []);
  const openContextMenu = useCallback((objectId: string, x: number, y: number) => {
    setMenu({ objectId, x, y });
  }, []);
  const canDeleteMenuTarget = canDeleteHierarchySelection(objects, menuSelectionIds, {
    lockedRootId,
    requireCamera,
  });

  const handleAssetDrop = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes("application/x-tgan-asset")) return;
    const asset = assetPayloadFromDrop(event);
    if (!asset) return;
    event.preventDefault();
    event.stopPropagation();
    setAssetDropActive(false);
    addAssetToHierarchy(asset);
  }, [addAssetToHierarchy]);

  return (
    <aside
      className={`rail rail-left ${assetDropActive ? "asset-drop-active" : ""}`}
      aria-label="Hierarchy"
      tabIndex={-1}
      onKeyDown={selection.handleKeyDown}
      onDragOverCapture={(event) => {
        if (!event.dataTransfer.types.includes("application/x-tgan-asset")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setAssetDropActive(true);
      }}
      onDragLeaveCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) setAssetDropActive(false);
      }}
      onDropCapture={handleAssetDrop}
    >
      <div className="rail-section">
        <div className="rail-heading">
          <span>Hierarchy</span>
          <span className="rail-meta" title={`${objects.length} scene objects`}>{objects.length}</span>
        </div>
        <div className="hierarchy-toolbar">
          <HierarchyAddMenu addPrimitive={addPrimitive} addCamera={addCamera} />
          <label className="hierarchy-search" aria-label="Search hierarchy">
            <EditorIcon name="search" size="row-action" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search" />
          </label>
          <HierarchyDensityButton density={density} onToggle={toggleDensity} />
        </div>
        <HierarchyList
          rows={rows}
          density={density}
          hasSolo={objects.some((object) => object.solo)}
          activeObjectId={activeObjectId}
          activeCameraId={activeCameraId}
          viewThroughCameraId={viewThroughCameraId}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
          lockedRootId={lockedRootId}
          trailingDropTarget={trailingDropTarget}
          selection={selection}
          materials={materials}
          updateObject={updateObject}
          assignMaterialToObject={assignMaterialToObject}
          lookThroughCamera={lookThroughCamera}
          frameObject={frameObject}
          moveObject={moveObject}
          openContextMenu={openContextMenu}
        />
      </div>

      {menu && menuObject && (
        <HierarchyContextMenu
          object={menuObject}
          selectionCount={menuSelectionIds.length}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onCreateEmpty={() => createEmpty(menuObject.id)}
          onCreateEmptyParent={() => createEmptyParent(menuSelectionIds)}
          onDuplicate={() => duplicateObjects(menuSelectionIds.filter((id) => id !== lockedRootId))}
          onRename={() => selection.startRename(menuObject.id)}
          onFrame={() => frameObject(menuObject.id)}
          onSetActiveCamera={menuObject.primitive === "camera" ? () => setActiveCamera(menuObject.id) : undefined}
          onLookThrough={menuObject.primitive === "camera" ? () => lookThroughCamera(menuObject.id) : undefined}
          onAlignView={menuObject.primitive === "camera" ? () => alignCameraToView(menuObject.id) : undefined}
          onDelete={() => deleteObjects(menuSelectionIds.filter((id) => id !== lockedRootId))}
          canDelete={canDeleteMenuTarget}
          canCreateEmptyParent={menuSelectionIds.some((id) => id !== lockedRootId)}
          canDuplicate={menuSelectionIds.some((id) => id !== lockedRootId)}
          canRename={menuObject.id !== lockedRootId}
        />
      )}
    </aside>
  );
}
