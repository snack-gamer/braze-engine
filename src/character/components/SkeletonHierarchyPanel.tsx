import { memo, useMemo, useState, type CSSProperties } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { humanBoneLabel, type HumanoidMappingBone } from "../application/humanoid-mapping";
import type { HumanBoneMapping, HumanoidBoneName } from "../domain/humanoid-avatar";
import type { BoneId } from "../domain/skeleton";
import { writeSkeletonBoneDrag } from "./skeleton-bone-drag-data";
import "./SkeletonHierarchyPanel.css";

type SkeletonHierarchyPanelProps = Readonly<{
  bones: readonly HumanoidMappingBone[];
  mapping?: HumanBoneMapping;
  dragEnabled?: boolean;
  selectedBoneId: BoneId | null;
  onSelectBone: (boneId: BoneId) => void;
}>;

type HierarchyRow = Readonly<{
  bone: HumanoidMappingBone;
  depth: number;
  hasChildren: boolean;
}>;

export const SkeletonHierarchyPanel = memo(function SkeletonHierarchyPanel({
  bones,
  mapping = {},
  dragEnabled = false,
  selectedBoneId,
  onSelectBone,
}: SkeletonHierarchyPanelProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<BoneId>>(() => new Set());
  const [draggingBoneId, setDraggingBoneId] = useState<BoneId | null>(null);
  const model = useMemo(() => hierarchyModel(bones, mapping), [bones, mapping]);
  const rows = useMemo(
    () => visibleHierarchyRows(model, collapsed, query),
    [collapsed, model, query],
  );
  const toggle = (boneId: BoneId) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(boneId)) next.delete(boneId);
    else next.add(boneId);
    return next;
  });

  return (
    <aside className="skeleton-hierarchy" aria-labelledby="skeleton-hierarchy-title">
      <header>
        <span>
          <EditorIcon name="prefabLink" size="control" />
          <strong id="skeleton-hierarchy-title">Skeleton</strong>
        </span>
        <small>{bones.length} bones{dragEnabled ? " · Drag to assign" : ""}</small>
      </header>
      <div className="skeleton-hierarchy__toolbar">
        <label>
          <EditorIcon name="search" size="compact" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search bones"
            aria-label="Search skeleton bones"
          />
        </label>
        <button type="button" className="icon-button compact" title="Expand all bones" onClick={() => setCollapsed(new Set())}>
          <EditorIcon name="disclosureOpen" size="compact" />
        </button>
        <button
          type="button"
          className="icon-button compact"
          title="Collapse all bones"
          onClick={() => setCollapsed(new Set(model.parents))}
        >
          <EditorIcon name="disclosureClosed" size="compact" />
        </button>
      </div>
      <div className="skeleton-hierarchy__tree" role="tree" aria-label="Imported skeleton hierarchy">
        {rows.map(({ bone, depth, hasChildren }) => {
          const mappedRole = model.roleByBone.get(bone.id);
          const isCollapsed = collapsed.has(bone.id) && !query.trim();
          const rowStyle = { "--skeleton-depth": depth } as CSSProperties;
          return (
            <div
              key={bone.id}
              className={`skeleton-hierarchy__row ${selectedBoneId === bone.id ? "active" : ""}`}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selectedBoneId === bone.id}
              aria-expanded={hasChildren ? !isCollapsed : undefined}
              data-state={mappedRole ? "mapped" : "unmapped"}
              data-dragging={draggingBoneId === bone.id || undefined}
              style={rowStyle}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="skeleton-hierarchy__disclosure"
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${bone.name}`}
                  onClick={() => toggle(bone.id)}
                >
                  <EditorIcon name={isCollapsed ? "disclosureClosed" : "disclosureOpen"} size="disclosure" />
                </button>
              ) : <span className="skeleton-hierarchy__disclosure" />}
              <button
                type="button"
                className="skeleton-hierarchy__bone"
                title={`${bone.path}${dragEnabled ? "\nDrag into a Humanoid mapping slot" : ""}`}
                draggable={dragEnabled}
                onClick={() => onSelectBone(bone.id)}
                onDragStart={(event) => {
                  if (!dragEnabled) {
                    event.preventDefault();
                    return;
                  }
                  writeSkeletonBoneDrag(event.dataTransfer, bone.id);
                  setDraggingBoneId(bone.id);
                  onSelectBone(bone.id);
                }}
                onDragEnd={() => setDraggingBoneId(null)}
              >
                <EditorIcon name="object" size="compact" />
                <span>{bone.name}</span>
                {mappedRole && <small>{humanBoneLabel(mappedRole)}</small>}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <p>{bones.length === 0 ? "No skeleton found." : "No bones match this search."}</p>}
      </div>
    </aside>
  );
});

type HierarchyModel = Readonly<{
  roots: readonly BoneId[];
  byId: ReadonlyMap<BoneId, HumanoidMappingBone>;
  children: ReadonlyMap<BoneId, readonly BoneId[]>;
  parents: readonly BoneId[];
  roleByBone: ReadonlyMap<BoneId, HumanoidBoneName>;
}>;

function hierarchyModel(bones: readonly HumanoidMappingBone[], mapping: HumanBoneMapping): HierarchyModel {
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const children = new Map<BoneId, BoneId[]>();
  const roots: BoneId[] = [];
  for (const bone of bones) {
    if (!bone.parentId || !byId.has(bone.parentId)) roots.push(bone.id);
    else children.set(bone.parentId, [...(children.get(bone.parentId) ?? []), bone.id]);
  }
  const roleByBone = new Map<BoneId, HumanoidBoneName>();
  for (const [role, boneId] of Object.entries(mapping) as Array<[HumanoidBoneName, BoneId]>) {
    if (boneId) roleByBone.set(boneId, role);
  }
  return { roots, byId, children, parents: [...children.keys()], roleByBone };
}

function visibleHierarchyRows(
  model: HierarchyModel,
  collapsed: ReadonlySet<BoneId>,
  query: string,
): HierarchyRow[] {
  const normalized = query.trim().toLowerCase();
  const included = normalized ? matchingBonesAndAncestors(model, normalized) : null;
  const output: HierarchyRow[] = [];
  const visit = (id: BoneId, depth: number) => {
    const bone = model.byId.get(id);
    if (!bone || (included && !included.has(id))) return;
    const children = model.children.get(id) ?? [];
    output.push({ bone, depth, hasChildren: children.length > 0 });
    if (!normalized && collapsed.has(id)) return;
    children.forEach((child) => visit(child, depth + 1));
  };
  model.roots.forEach((root) => visit(root, 0));
  return output;
}

function matchingBonesAndAncestors(model: HierarchyModel, query: string): Set<BoneId> {
  const included = new Set<BoneId>();
  for (const bone of model.byId.values()) {
    if (!`${bone.name} ${bone.path}`.toLowerCase().includes(query)) continue;
    let cursor: HumanoidMappingBone | undefined = bone;
    while (cursor && !included.has(cursor.id)) {
      included.add(cursor.id);
      cursor = cursor.parentId ? model.byId.get(cursor.parentId) : undefined;
    }
  }
  return included;
}
