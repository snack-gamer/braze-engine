import type { ComponentProps, ReactNode } from "react";
import type { FolderPath } from "../../hooks/useAssetFolders";
import { EditorIcon } from "../../ui/EditorIcon";
import { AssetFolderSidebar } from "./AssetFolderSidebar";
import { hasAssetDragPayload, hasExternalFiles } from "./drag";

type AssetBrowserWorkspaceProps = {
  sidebar: ComponentProps<typeof AssetFolderSidebar>;
  crumbs: Array<{ label: string; path: FolderPath }>;
  folderDropHover: FolderPath | null;
  itemCount: number;
  onBrowseFolder: (path: FolderPath) => void;
  onDropHover: (path: FolderPath | null) => void;
  onDropOnFolder: (event: React.DragEvent, path: FolderPath) => void;
  children: ReactNode;
};

export function AssetBrowserWorkspace(props: AssetBrowserWorkspaceProps) {
  return (
    <div className="assets__workspace">
      <AssetFolderSidebar {...props.sidebar} />
      <section className="assets__content" aria-label="Project contents">
        <div className="assets__content-head">
          <nav className="assets__crumbs" aria-label="Folder path">
            {props.crumbs.map((crumb, index) => (
              <span key={crumb.path || "root"} className="assets__crumb-row">
                {index > 0 && <EditorIcon name="disclosureClosed" size="micro" className="assets__crumb-sep" />}
                <button
                  type="button"
                  className={`assets__crumb ${index === props.crumbs.length - 1 ? "current" : ""} ${
                    props.folderDropHover === crumb.path && index < props.crumbs.length - 1 ? "drop-target" : ""
                  }`}
                  onClick={() => props.onBrowseFolder(crumb.path)}
                  onDragOver={(event) => {
                    const files = hasExternalFiles(event.dataTransfer);
                    if (!files && !hasAssetDragPayload(event.dataTransfer)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = files ? "copy" : "move";
                    props.onDropHover(crumb.path);
                  }}
                  onDragLeave={() => props.onDropHover(
                    props.folderDropHover === crumb.path ? null : props.folderDropHover,
                  )}
                  onDrop={(event) => {
                    props.onDropHover(null);
                    props.onDropOnFolder(event, crumb.path);
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
          <span className="assets__item-count">
            {props.itemCount} {props.itemCount === 1 ? "item" : "items"}
          </span>
        </div>
        {props.children}
      </section>
    </div>
  );
}
