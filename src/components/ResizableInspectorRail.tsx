import type { ReactNode } from "react";
import { EditorIcon } from "../ui/EditorIcon";

type ResizableInspectorRailProps = {
  children: ReactNode;
};

export function ResizableInspectorRail({ children }: ResizableInspectorRailProps) {
  return (
    <aside className="rail rail-right" aria-label="Inspector">
      <header className="inspector-dock-title">
        <EditorIcon name="inspector" size="toolbar" />
        <strong>Inspector</strong>
        <span>Properties</span>
      </header>
      <div className="inspector-dock-content">{children}</div>
    </aside>
  );
}
