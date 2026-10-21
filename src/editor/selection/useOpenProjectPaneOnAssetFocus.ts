import { useEffect } from "react";
import { subscribeProjectModelSubAssetFocus } from "../../assets/application/project-asset-focus-channel";

/** Makes cross-editor asset reveals visible even when Project is closed or tabbed away. */
export function useOpenProjectPaneOnAssetFocus(openPane: (pane: "project") => void): void {
  useEffect(() => subscribeProjectModelSubAssetFocus(() => openPane("project")), [openPane]);
}
