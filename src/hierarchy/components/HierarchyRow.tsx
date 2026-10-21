import type { CSSProperties, DragEvent, MouseEvent } from "react";
import type { HierarchyDropPosition } from "../hierarchy-drop";
import type { HierarchyRow as HierarchyRowModel } from "../hierarchy-model";
import type { Material, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { primitiveIconNames } from "../../ui/icons";
import { toneClassName } from "../../ui/tones";
import { hierarchyObjectTone } from "../hierarchy-presentation";
import { HierarchyComponentIndicators } from "./HierarchyComponentIndicators";

type HierarchyRowProps = {
  row: HierarchyRowModel;
  rowIndex: number;
  activeObjectId: string;
  activeCameraId: string;
  viewThroughCameraId: string | null;
  selected: boolean;
  collapsed: boolean;
  dragging: boolean;
  dimmedBySolo: boolean;
  dropPosition: HierarchyDropPosition | null;
  lockedRootId: string | null;
  editing: boolean;
  renameDraft: string;
  materials: Material[];
  onSelect: (event: MouseEvent, objectId: string) => void;
  onFrame: (objectId: string) => void;
  onContextMenu: (event: MouseEvent, objectId: string) => void;
  onToggleCollapsed: (objectId: string) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onUpdateObject: (id: string, patch: Partial<SceneObject>) => void;
  onAssignMaterial: (objectId: string, materialId: string | null) => void;
  onLookThroughCamera: (objectId: string) => void;
  onDragStart: (event: DragEvent, objectId: string) => void;
  onDragOver: (event: DragEvent, objectId: string) => void;
  onDragLeave: (objectId: string) => void;
  onDrop: (event: DragEvent, objectId: string) => void;
  onDragEnd: (objectId: string) => void;
};

export function HierarchyRow(props: HierarchyRowProps) {
  const { object, depth, hasChildren } = props.row;
  const isCamera = object.primitive === "camera";
  const isActiveCamera = isCamera && object.id === props.activeCameraId;
  const isViewThroughCamera = isCamera && object.id === props.viewThroughCameraId;
  const tinted = Boolean(object.rowColorEnabled && object.rowColor);
  const classes = [
    "object-row",
    object.id === props.activeObjectId ? "active" : "",
    props.selected ? "selected" : "",
    tinted ? "tinted" : "",
    props.dragging ? "dragging-row" : "",
    object.locked ? "locked" : "",
    props.dimmedBySolo ? "dimmed" : "",
    props.row.inactive ? "inactive" : "",
    props.row.prefabRoot ? "prefab-root" : "",
    props.dropPosition ? `drop-target--${props.dropPosition}` : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={classes}
      style={{
        "--row-depth": String(depth),
        "--row-color": object.rowColor ?? object.color,
      } as CSSProperties}
      data-hierarchy-object-id={object.id}
      data-hierarchy-row-index={props.rowIndex}
      data-hierarchy-depth={depth}
      data-hierarchy-inactive={props.row.inactive || undefined}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={props.selected}
      aria-expanded={hasChildren ? !props.collapsed : undefined}
      onClick={(event) => props.onSelect(event, object.id)}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onFrame(object.id);
      }}
      onContextMenu={(event) => props.onContextMenu(event, object.id)}
      type="button"
      title={isActiveCamera
        ? "Active render camera"
        : `${object.name || "Unnamed"} — ${object.primitive}${props.row.inactive ? " (hidden)" : ""}`}
      draggable={object.id !== props.lockedRootId}
      onDragStart={(event) => props.onDragStart(event, object.id)}
      onDragOver={(event) => props.onDragOver(event, object.id)}
      onDragLeave={() => props.onDragLeave(object.id)}
      onDrop={(event) => props.onDrop(event, object.id)}
      onDragEnd={() => props.onDragEnd(object.id)}
    >
      <span className="object-row__lead">
        <HierarchyTreeGuides guides={props.row.guides} />
        {hasChildren ? (
          <span
            className="object-row__chevron"
            role="button"
            tabIndex={-1}
            title={props.collapsed ? "Expand" : "Collapse"}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleCollapsed(object.id);
            }}
          >
            <EditorIcon name={props.collapsed ? "disclosureClosed" : "disclosureOpen"} size="disclosure" />
          </span>
        ) : (
          <span className="object-row__chevron object-row__chevron--spacer" aria-hidden />
        )}
        <EditorIcon
          name={primitiveIconNames[object.primitive]}
          size="tree"
          weight="strong"
          className={`object-row__type-icon object-row__type-icon--${object.primitive} ${toneClassName(hierarchyObjectTone(props.row))} ${isActiveCamera ? "active" : ""}`}
          aria-hidden
        />
        {props.editing ? (
          <input
            className="object-name-input"
            value={props.renameDraft}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => props.onRenameDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onCommitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                props.onCancelRename();
              }
            }}
            onBlur={props.onCommitRename}
          />
        ) : (
          <span className="object-name">{object.name || "(unnamed)"}</span>
        )}
        <MaterialChip object={object} materials={props.materials} onAssignMaterial={props.onAssignMaterial} />
      </span>

      <span className="object-actions">
        <RowAction
          active={Boolean(object.solo)}
          title={object.solo ? "Unsolo" : "Solo — hide everything else"}
          icon="solo"
          filled={object.solo}
          onClick={() => props.onUpdateObject(object.id, { solo: !object.solo })}
        />
        {isCamera ? (
          <RowAction
            active={isViewThroughCamera}
            className={`camera-view-icon ${isViewThroughCamera ? "active-view" : ""}`}
            title={isViewThroughCamera ? "Viewing through this camera" : "Look through this camera"}
            icon="cameraView"
            onClick={() => props.onLookThroughCamera(object.id)}
          />
        ) : (
          <span className="row-icon row-icon--placeholder" aria-hidden />
        )}
        <RowAction
          active={!object.visible}
          title={object.visible ? "Hide in editor" : "Show in editor"}
          icon={object.visible ? "visible" : "hidden"}
          onClick={() => props.onUpdateObject(object.id, { visible: !object.visible })}
        />
        <RowAction
          active={object.locked}
          title={object.locked ? "Unlock" : "Lock (prevent select + transform)"}
          icon={object.locked ? "locked" : "unlocked"}
          onClick={() => props.onUpdateObject(object.id, { locked: !object.locked })}
        />
      </span>
      <HierarchyComponentIndicators object={object} />
    </button>
  );
}

function HierarchyTreeGuides({ guides }: { guides: readonly boolean[] }) {
  if (guides.length === 0) return null;
  return (
    <span className="hierarchy-tree-guides" aria-hidden>
      {guides.map((continues, depth) => {
        const directBranch = depth === guides.length - 1;
        if (!directBranch && !continues) return null;
        return (
          <span
            key={depth}
            className={`hierarchy-tree-guide ${directBranch ? "hierarchy-tree-guide--branch" : ""} ${continues ? "continues" : "ends"}`}
            style={{ "--guide-depth": String(depth) } as CSSProperties}
          />
        );
      })}
    </span>
  );
}

function MaterialChip(props: {
  object: SceneObject;
  materials: Material[];
  onAssignMaterial: (objectId: string, materialId: string | null) => void;
}) {
  const material = props.object.materialId
    ? props.materials.find((candidate) => candidate.id === props.object.materialId)
    : null;
  if (!material) return null;
  return (
    <span
      className="material-chip"
      title={`Material: ${material.name} — click ✕ to unassign`}
      style={{ background: material.color }}
      onClick={(event) => event.stopPropagation()}
    >
      <span>{material.name}</span>
      <span
        role="button"
        tabIndex={0}
        className="material-chip-remove"
        onClick={(event) => {
          event.stopPropagation();
          props.onAssignMaterial(props.object.id, null);
        }}
        title="Remove material"
      >
        ✕
      </span>
    </span>
  );
}

type RowActionProps = {
  active: boolean;
  title: string;
  icon: Parameters<typeof EditorIcon>[0]["name"];
  filled?: boolean;
  className?: string;
  onClick: () => void;
};

function RowAction({ active, title, icon, filled, className = "", onClick }: RowActionProps) {
  return (
    <span
      className={`row-icon ${className} ${active ? "active" : ""}`}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <EditorIcon name={icon} size="row-action" filled={filled} />
    </span>
  );
}
