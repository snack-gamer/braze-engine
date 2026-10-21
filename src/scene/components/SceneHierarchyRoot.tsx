import { useState, type ReactNode } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { useSceneWorkspaceState } from "./SceneWorkspaceContext";

/** A scene owns a hierarchy; it is not a transform entity or a prefab parent. */
export function SceneHierarchyRoot({ children, prefab }: { children: ReactNode; prefab: boolean }) {
  const { snapshot } = useSceneWorkspaceState(), [collapsed, setCollapsed] = useState(false);
  if (!snapshot || prefab) return children;
  return <div className="scene-hierarchy">
    <button type="button" className="scene-hierarchy__root" aria-expanded={!collapsed} aria-label={`Scene ${snapshot.editor.name}`}
      onClick={() => setCollapsed(!collapsed)}>
      <EditorIcon name={collapsed ? "disclosureClosed" : "disclosureOpen"} size="control" />
      <EditorIcon name="sceneDocument" size="control" />
      <strong>{snapshot.editor.name}{snapshot.editor.dirty ? " *" : ""}</strong><span>{snapshot.editor.objectCount}</span>
    </button>
    <div className="scene-hierarchy__contents" hidden={collapsed}>{children}</div>
  </div>;
}
