import type { ReactNode } from "react";
import { EditorIcon } from "../../ui/EditorIcon";

type MeshRendererFoldoutProps = {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** Dense Unity-style subgroup used only inside the Mesh Renderer component. */
export function MeshRendererFoldout({
  id,
  title,
  meta,
  children,
  defaultOpen = true,
}: MeshRendererFoldoutProps) {
  return (
    <details className="mesh-renderer-foldout" id={id} open={defaultOpen}>
      <summary
        className="mesh-renderer-foldout__head"
      >
        <EditorIcon name="disclosureClosed" size="disclosure" className="mesh-renderer-foldout__chevron" />
        <span className="mesh-renderer-foldout__title">{title}</span>
        {meta && <span className="mesh-renderer-foldout__meta">{meta}</span>}
      </summary>
      <div className="mesh-renderer-foldout__body">{children}</div>
    </details>
  );
}
